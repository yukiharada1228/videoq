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
    expect(resources.filter(r => r.kind === "Service")).toHaveLength(2);
    expect(resources.filter(r => r.kind === "Service").every(r => r.spec.type === "ClusterIP")).toBe(true);
    expect(resources.filter(r => r.kind === "PersistentVolumeClaim")).toHaveLength(2);
    const pods = resources.filter(r => r.kind === "Deployment").map(r => r.spec.template.spec);
    for (const pod of pods) {
      expect(pod.automountServiceAccountToken).toBe(false);
      expect(pod.initContainers).toHaveLength(1);
      expect(pod.securityContext.runAsNonRoot).toBe(true);
    }
    expect(pods.find(p => p.containers[0].name === "ollama").containers[0].env).toContainEqual({ name: "OLLAMA_NO_CLOUD", value: "1" });
    expect(pods.find(p => p.containers[0].name === "ollama").containers[0].readinessProbe.exec.command[2]).toContain('ollama show "$CHAT_MODEL"');
    const whisper = pods.find(p => p.containers[0].name === "whisper");
    expect(whisper.containers[0].env).toContainEqual({ name: "HF_HUB_OFFLINE", value: "1" });
    expect(whisper.containers[0].volumeMounts[0].readOnly).toBe(true);
    const policy = resources.find(r => r.kind === "NetworkPolicy");
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
    const resources = render("-f", `${chart}/examples/nvidia.yaml`);
    for (const deployment of resources.filter(r => r.kind === "Deployment")) {
      const container = deployment.spec.template.spec.containers[0];
      expect(container.resources.limits["nvidia.com/gpu"]).toBe(1);
      expect(deployment.spec.template.spec.nodeSelector["kubernetes.io/arch"]).toBe("amd64");
    }
  });
  it("rejects mutable Whisper revisions, cloud model names and unpinned production images", () => {
    for (const setting of ["whisper.modelRevision=main", "whisper.device=auto", "ollama.chatModel=gemma4:cloud", "requireImageDigests=true"]) {
      expect(command("--set", setting).status).not.toBe(0);
    }
    const resources = render("--set", "requireImageDigests=true", "--set", `whisper.image.digest=sha256:${"b".repeat(64)}`);
    expect(resources.filter(r => r.kind === "Deployment").every(r => r.spec.template.spec.containers[0].image.includes("@sha256:"))).toBe(true);
  });
});
