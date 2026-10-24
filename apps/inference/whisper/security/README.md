# NVIDIA speech image assessment

The image keeps the C/UAPI headers needed by Triton's runtime JIT. These headers
are not a Linux kernel. The build runs `verify_kernel_headers.py`: every regular
file owned by `linux-libc-dev` must be a header or its documentation, none may be
ELF or a kernel module, and the image may contain no kernel binaries/modules.
Do not remove package metadata or retain untracked headers to change scan results.

`kernel-headers.openvex.json` lists the 386 kernel implementation CVEs reported on
this package by CI run 39954013361 on 2026-10-23. The assessment is restricted to
Ubuntu 24.04 amd64 `linux-libc-dev` version `6.8.0-147.147`, with explicit vulnerability IDs and the
`vulnerable_code_not_present` justification. It does not apply to host kernels,
other packages, unknown CVEs, or another distribution/architecture. A new package version does not match this assessment and requires a fresh
review. A changed package inventory also fails the image build instead of
silently accepting executable code under the assessment.

The image separately updates its Ubuntu packages, certifi, msgpack and urllib3,
and removes pip/uv after installing audio support. Removing pip also removes
its vulnerable vendored copies; changing only the top-level dependencies would
leave those copies in the image. Runtime package records are preserved.

CI applies `trivy.yaml` only to this NVIDIA speech image. HIGH/CRITICAL findings,
including unfixed ones, still fail unless covered by the explicit assessment.
The JSON report uses `show-suppressed`, so both outstanding and assessed findings
remain available in the `whisper-vllm-security` artifact alongside this directory.
Never describe an assessed passing result as zero raw findings.

From the repository root, after building the image:

```sh
trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 \
  --config apps/inference/whisper/security/trivy.yaml \
  --format json --output whisper-vllm-security.json YOUR_PRIVATE_ENGINE_IMAGE
```

To obtain the unassessed report, omit `--config` and use a different output path.
Before promoting an image, retain both the report and the exact image digest.
Assess and patch the actual Kubernetes host kernel independently during site
acceptance; its state cannot be established by scanning the container's headers.

References:
- [Trivy maintainer explanation of kernel header findings](https://github.com/aquasecurity/trivy/discussions/6562)
- [Trivy OpenVEX and package URL matching](https://trivy.dev/docs/latest/supply-chain/vex/file/)
- [Example Ubuntu kernel implementation advisory](https://ubuntu.com/security/CVE-2026-63825)
- [Triton runtime compilation](https://github.com/triton-lang/triton/blob/v3.8.0/third_party/nvidia/backend/driver.py)
