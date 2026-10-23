import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import { describe, expect, it } from "vitest";

const helm = process.env.HELM_BIN;
const chart = fileURLToPath(new URL("../../../charts/videoq-inference", import.meta.url));
const withHelm = helm ? describe : describe.skip;

withHelm("private local inference deployment", () => {
  const command = (...extra: string[]) => spawnSync(helm!, ["template", "inference", chart, ...extra], { encoding: "utf8" });
  function render(...extra: string[]) {
    const result = command(...extra);
    expect(result.status, result.stderr).toBe(0);
    return parseAllDocuments(result.stdout).filter(doc => doc.contents).map(doc => doc.toJSON());
  }
  it("keeps models persistent and serves only private APIs with cloud inference disabled", () => {
    const resources = render();
    expect(resources.filter(r => r.kind === "Service")).toHaveLength(3);
    expect(resources.filter(r => r.kind === "Service").every(r => r.spec.type === "ClusterIP")).toBe(true);
    expect(resources.filter(r => r.kind === "PersistentVolumeClaim")).toHaveLength(3);
    const pods = resources.filter(r => r.kind === "Deployment").map(r => r.spec.template.spec);
    for (const pod of pods) {
      expect(pod.automountServiceAccountToken).toBe(false);
      expect(pod.initContainers).toHaveLength(1);
      expect(pod.securityContext.runAsNonRoot).toBe(true);
    }
    for (const pod of pods) {
      const server = pod.containers[0];
      expect(server.resources.limits["nvidia.com/gpu"]).toBeUndefined();
      expect(server.env).toContainEqual({ name: "HF_HUB_OFFLINE", value: "1" });
    }
    expect(resources.find(r => r.metadata.name === "videoq-inference-chat" && r.kind === "Deployment")
      .spec.template.spec.containers[0].args).toContain("--offline");
    const whisper = pods.find(p => p.containers[0].name === "whisper");
    expect(whisper.containers[0].env).toContainEqual({ name: "HF_HUB_OFFLINE", value: "1" });
    expect(whisper.containers[0].volumeMounts[0].readOnly).toBe(true);
    const policy = resources.find(r => r.kind === "NetworkPolicy");
    expect(policy.spec.ingress[0].ports.map((port: { port: number }) => port.port).sort()).toEqual([8000, 8080]);
    expect(policy.spec.ingress[0].from[0]).toMatchObject({
      namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "videoq" } },
      podSelector: { matchLabels: { "app.kubernetes.io/instance": "videoq" } },
    });
  });
  it("can remove every model downloader and deny inference egress after provisioning", () => {
    const resources = render("--set", "downloadModels=false", "--set", "networkPolicy.denyEgress=true");
    for (const deployment of resources.filter(r => r.kind === "Deployment")) {
      expect(deployment.spec.template.spec.initContainers).toBeUndefined();
    }
    expect(resources.find(r => r.kind === "NetworkPolicy").spec.egress).toEqual([]);
    expect(command("--set", "networkPolicy.denyEgress=true").status).not.toBe(0);
  });
  it("requests NVIDIA GPUs only when explicitly enabled", () => {
    const resources = render("-f", `${chart}/examples/whisper-nvidia.yaml`);
    for (const deployment of resources.filter(r => r.kind === "Deployment")) {
      const container = deployment.spec.template.spec.containers[0];
      const whisper = deployment.metadata.name.endsWith("-whisper");
      expect(container.resources.limits["nvidia.com/gpu"]).toBe(whisper ? 1 : undefined);
      if (whisper) expect(deployment.spec.template.spec.nodeSelector["kubernetes.io/arch"]).toBe("amd64");
    }
  });
  it.each(["llamacpp-cpu", "vllm-nvidia"])("provisions independent private model services for %s", (profile) => {
    const resources = render("-f", `${chart}/examples/${profile}.yaml`);
    expect(resources.filter(r => r.kind === "Service").map(r => r.metadata.name).sort()).toEqual([
      "videoq-inference-chat", "videoq-inference-embedding", "videoq-inference-whisper",
    ]);
    expect(resources.filter(r => r.kind === "PersistentVolumeClaim")).toHaveLength(3);
    for (const resource of resources.filter(r => r.kind === "Deployment" && !r.metadata.name.endsWith("-whisper"))) {
      const pod = resource.spec.template.spec;
      const server = pod.containers[0];
      expect(pod.automountServiceAccountToken).toBe(false);
      expect(pod.securityContext.runAsNonRoot).toBe(true);
      expect(pod.initContainers[0].command).toEqual(["python", "provision.py"]);
      expect(server.volumeMounts[0].readOnly).toBe(true);
      expect(server.env).toContainEqual({ name: "HF_HUB_OFFLINE", value: "1" });
      expect(server.args.some((arg: string) => arg.startsWith("/models/"))).toBe(true);
      expect(server.args).not.toContain("--trust-remote-code");
      expect(server.resources.limits["nvidia.com/gpu"]).toBe(profile === "vllm-nvidia" ? 1 : undefined);
      if (profile === "llamacpp-cpu") expect(server.args).toContain("--offline");
      else expect(pod.volumes).toContainEqual({ name: "shm", emptyDir: { medium: "Memory", sizeLimit: "2Gi" } });
    }
    const offline = render("-f", `${chart}/examples/${profile}.yaml`, "--set", "downloadModels=false", "--set", "networkPolicy.denyEgress=true");
    expect(offline.filter(r => r.kind === "Deployment").every(r => !r.spec.template.spec.initContainers)).toBe(true);
    expect(offline.find(r => r.kind === "NetworkPolicy").spec.egress).toEqual([]);
  });
  it("rejects invalid engines, mutable model revisions, and incompatible weight formats", () => {
    for (const setting of ["backend=unknown", "unknownSetting=true", "servers.chat.unknownSetting=true", "backend=vllm", "servers.chat.modelRevision=main", "servers.chat.modelFile=../model.gguf", "backend=llamacpp,servers.chat.modelSha256="]) {
      expect(command("--set", setting).status).not.toBe(0);
    }
  });
  it("rejects mutable Whisper revisions and unpinned production images", () => {
    for (const setting of ["whisper.modelRevision=main", "whisper.device=auto", "requireImageDigests=true"]) {
      expect(command("--set", setting).status).not.toBe(0);
    }
    const resources = render("--set", "requireImageDigests=true", "--set", `whisper.image.digest=sha256:${"b".repeat(64)}`);
    expect(resources.filter(r => r.kind === "Deployment").every(r => r.spec.template.spec.containers[0].image.includes("@sha256:"))).toBe(true);
  });
});
