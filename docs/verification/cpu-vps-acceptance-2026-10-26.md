# Issue #1173: CPU-only validation on the actual operations VPS

## Result: blocked, not end-to-end accepted

Checked source: `6228bc8eea067d1d7730ea85c204ab30e337762f` (current main at
inspection). Observed 2026-10-26 11:13 UTC. This is the owner's specified VPS,
not an unspecified personal PC. No PR #1165 changes were used. No inference,
model download, cluster, privileged installation, service restart, paid resource,
scheduler or research-budget operation was started.

Local evidence: [preflight stdout/stderr and exit codes](cpu-vps-preflight-2026-10-26.json).
Reproduce the bounded, read-only probe from a reviewed checkout:

```sh
python3 docs/verification/cpu-vps-preflight.py > cpu-preflight.json
# Exit 2 = blocked. Exit 0 still requires administrator review, not acceptance.
```

The probe ran successfully as an investigation and returned **2 (blocked)**.
Actual media component check: the repository's public 10.44-second Japanese
FLEURS MP3 matched its SHA-256 and FFmpeg decoded it successfully (exit 0).
This tests decoding only, **not Whisper, embeddings or chat**.

| Measured local item | Observation |
|---|---|
| OS / CPU affinity | Linux x86_64 / 4 CPUs |
| Physical RAM | 4,003,540 KiB total |
| Available RAM before / after probe | 2,474,976 / 2,463,076 KiB |
| Swap total / free | 2,957,308 / 2,618,456 KiB; already in use |
| Free disk at checkout | 589,571,153,920 bytes |
| Maximum child RSS across probe commands | 66,544 KiB; **not model/stack RSS** |
| Tooling | Docker, Podman, kubectl, kind, Helm and CMake absent on PATH |
| Runtime identity | UID/GID 1001, not root; no Docker socket at checked standard path |
| Effective cgroup limits / unrelated workload peaks | Not visible from this sandbox; unknown |
| gh | PATH wrapper, underlying 2.45.0; `attestation` unsupported |

The real signed-release verifier was also attempted against the downloaded
manifest. It exited **1** at `gh attestation verify` (unknown command), before
Docker/inference, and emitted no verified values files. Downloaded chart hashes
match the manifest, but that is **not independent signature verification**.
Do not substitute an absolute gh binary or alternate API transport.

## Resource requirements versus this VPS

Inputs: `charts/videoq{,-inference}/values.yaml`, CPU overlay,
`.github/scripts/onprem-lab.py`, and the current deployment guides.
These are configuration reservations/limits, not measured physical usage.

| Default steady component | CPU request | RAM request | RAM limit |
|---|---:|---:|---:|
| llama.cpp chat, Qwen3-4B Q4_K_M, context 8192 | 2 | 4 GiB | 8 GiB |
| llama.cpp embedding, gte-Qwen2-1.5B Q4_K_M, context 8192 | 1 | 2 GiB | 4 GiB |
| whisper.cpp large-v3-turbo Q5_0 engine | 2 | 1 GiB | 2 GiB |
| Whisper gateway | 0.25 | 512 MiB | 2 GiB |
| API | 0.1 | 256 MiB | 1 GiB |
| Web | 0.05 | 32 MiB | 128 MiB |
| Video worker | 1 | 1 GiB | 4 GiB |
| Total, before backing services and cluster | 6.4 | 8.78125 GiB | 21.125 GiB |

Additionally required: PostgreSQL 17/pgvector, Garage/S3, persistent SQS-compatible
queue/DLQ (ElasticMQ in the disposable lab), cluster control plane/DNS, migration
and maintenance jobs, Chromium playback, backups, and existing VPS automation.
Default model PVC reservations total 20 GiB (10+5+5), excluding DB/media/images
and duplicate kind image caches. Disk is not the observed blocker.

The real acceptance harness deliberately overrides several requests downwards
(512 MiB per engine and 128 MiB per app) to fit a disposable 4-core runner;
that changes scheduling reservations, **not model working-set needs**. It is not
an adequate workaround for this 3.8-GiB shared VPS. Never interpret summed
limits as actual RAM measurement or swap as extra model capacity.

The documented minimum test target is a **dedicated nominal 16-GiB, 4-vCPU
Linux amd64 environment** with working Docker, kind/kubectl, Helm and browser
prerequisites. Reserve at least 80 GiB free test disk as a conservative planning
allowance, not a measured minimum. For this shared VPS, an administrator must
provide that test allowance **in addition to** measured existing workload headroom
and verify cgroup ancestor limits. No production concurrency/capacity minimum
has been measured. Installing Docker alone does not resolve the RAM blocker.
No host purchase or VPS resizing is authorized by this report.

## Separate existing signed-release evidence (not local acceptance)

Latest inspected validation run:
https://github.com/yukiharada1228/videoq/actions/runs/40282935724
passed; its real-source CPU steps were **skipped**, while the deterministic
Kubernetes rehearsal passed. Do not count that as current-main real inference.

Release run https://github.com/yukiharada1228/videoq/actions/runs/40278458459,
attempt 1, for the same source SHA, reports success for both signed-artifact
verification and `Real CPU models with public egress blocked`.
Downloaded small artifacts (no images/models) are summarized in
[captured hosted evidence and exact image/model identities](cpu-hosted-release-2026-10-26.json).
They are workflow-reported results, not independently reverified local signatures.

Hosted runner capacity: 4 CPUs, 16,373,444 KiB RAM (nominal 16 GiB).
Reported observations for one short public fixture:

- Transcription/indexing: 98.43 seconds; CER 0.0 against the public reference.
- Normal cited answer: 185.51 seconds; SSE completion: 118.94 seconds.
- Playback: actual citation 1.552 s, Chromium reached 1.687 s in a 10.52 s video.
- Overall rehearsal: 1140.71 seconds, including lifecycle checks.
- Public IP/DNS blocked and private inference reachable according to worker probe.

These measurements suggest multi-minute interaction even on that larger target;
they do not establish usability on this VPS. Neither artifact records peak
stack RAM/swap. No no-evidence-question result is present. No manual browser
review or real-VPS performance claim is made.

## Administrator handoff and bounded continuation

Keep #1173 open. Required external actions through the separately authorized
administrator maintenance path, not this issue worker:

1. Supply adequate RAM/headroom on the named VPS, or obtain explicit owner
   authorization for another already available CPU-only target. Do not buy one.
2. Provision/review a working isolated Docker daemon and permission to use it;
   compatible kubectl/kind (pinned kind 0.33.0), Helm 4.3.1, Node from
   `.node-version`, repository npm version, Python 3, FFmpeg and Chromium's OS
   libraries. A Docker group grants privileged host access: do not add it here.
3. Update the admitted PATH gh through the operations toolchain so it supports
   all flags in `.github/scripts/onprem-release.py:attest`. Preserve the admission
   wrapper and subscription authentication. Do not change credentials.
4. Review aggregate cgroup limits and real existing workload peaks, then record
   administrator approval of the concrete disposable-lab resource allowance.
   No global firewall, service or production infrastructure changes are needed
   for the harness's node-local firewall. Review Docker's host effects separately.

After those prerequisites, a bounded invocation can run the commands below.
Use a fresh reviewed checkout of the specified source, not this documentation
branch, for the actual release acceptance. The artifact names fix attempt 1;
no polling or `gh run view --json attempt` is needed (unsupported by this old CLI).
The scripts refuse to replace an existing `videoq-onprem-lab` cluster.

```sh
# Administrator-provisioned target only; initial downloads require internet.
set -eu
SOURCE_SHA=6228bc8eea067d1d7730ea85c204ab30e337762f
RUN_ID=40278458459
ACCEPTANCE_DIR="$PWD/cpu-acceptance-1173"
mkdir -m 700 "$ACCEPTANCE_DIR"
test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
node --version
npm --version
docker info
kubectl version --client
kind version
helm version --short
gh attestation verify --help
npm ci --ignore-scripts --workspace @videoq/api --workspace @videoq/web
# OS libraries must already have been provisioned by the administrator.
node node_modules/playwright/cli.js install chromium
gh run download "$RUN_ID" --repo yukiharada1228/videoq \
  --name "onprem-release-$SOURCE_SHA-attempt-1" --dir "$ACCEPTANCE_DIR/release"
python3 .github/scripts/onprem-release.py verify "$SOURCE_SHA" \
  "$ACCEPTANCE_DIR/release/release.json" \
  "$ACCEPTANCE_DIR/release/verified-images.json" \
  "$ACCEPTANCE_DIR/release/verified-inference.json"
/usr/bin/time -v -o "$ACCEPTANCE_DIR/process-time.txt" \
  python3 .github/scripts/onprem-cpu-acceptance.py "$SOURCE_SHA" \
  "$ACCEPTANCE_DIR/release" "$ACCEPTANCE_DIR/results" \
  > "$ACCEPTANCE_DIR/stdout.log" 2> "$ACCEPTANCE_DIR/stderr.log"
```

Select another release only after a fresh bounded task/Actions read and source
review. Retention is 90 days; expired artifacts require a newly reviewed release,
not disabling signature checks. The signed manifest supplies app/Whisper image
digests; its inference chart supplies pinned llama.cpp and exact model identities.
Current main and that release share a SHA, but source-only tests and release
verification remain distinct results. To exercise new source changes, use the
existing `onprem-validation.yml` real-CPU source-build recipe, recording
`PR source build test; not signed-release verification`; do not claim the default
validation job runs it automatically or launch another CI experiment here.

### Required evidence before calling the target accepted

The harness covers local chat/embedding/Whisper, login/setup, real upload,
transcript timestamps/CER, pgvector-backed indexing/retrieval, normal/SSE cited
answers, Chromium citation playback, egress probes and restore/upgrade/rollback.
The known fixture answer is “現地企業の住所” (local companies' addresses).

Separately test a no-evidence question in the logged-in UI, for example
“この動画の講師の生年月日は？” (the speaker's birth date). Record normal and SSE
responses verbatim: an invented birth date is a failure; insufficient-evidence
behavior is expected. Preserve model behavior, even on failure; do not change
Q&A prompts, model defaults or transport to make it pass. That check and manual
UI/screenshots remain unverified by the existing automated artifact.

During the run an administrator must capture a **bounded** sampler for the
exact disposable node/container cgroups plus host `MemAvailable` and swap,
before/during/after execution. `/usr/bin/time -v` measures client process trees,
**not Docker daemon/container memory**. Save actual timestamps, exit status,
peak aggregate RAM/swap and CPU throttling; do not report process RSS as stack
peak. Stop if the reviewed headroom is breached. Record full answers/transcript,
latencies, private endpoints and egress probe results, public fixture checksum,
image/model revisions, playback result and sanitized screenshots. Never commit
cookies, kubeconfig, Secrets, databases or unsanitized site configuration.

The harness deletes only its new cluster/network in `finally`; model/image caches
remain. Clean only resources attributable to this invocation, never prune shared
Docker state. External blockers must remain visible if setup or inference fails.
