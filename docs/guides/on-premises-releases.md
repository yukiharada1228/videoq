---
sidebar_label: Verified on-prem releases
description: Verify signed VideoQ images and charts, rehearse updates, and promote reviewed digests.
---

# Verified on-prem releases and updates

For sites with internet access, use an external OCI registry and immutable image
digests. The `On-prem Release` workflow prepares GHCR images for Linux amd64 and
arm64, a chart archive, and `release.json`. It runs only for the current source
repository main commit after successful push CI. It can also be dispatched for
that commit, for example to rebuild after distribution package fixes.

This workflow becomes available after it is merged into main. A workflow file or
local unit test is not evidence that an image has been published or signed.
Until the first successful release run exists, build and review your own images
using the chart README. No public package availability is assumed: GHCR packages
initially may be private. Operators need registry access and `imagePullSecrets`
or an administrator must explicitly make the packages public.

## What the release verifies

Application builds have read-only repository access. They scan each image for
HIGH/CRITICAL vulnerabilities, including unfixed findings, and export the image
and a CycloneDX inventory. Separate fresh runners publish the exact build
artifacts without running application containers or installing app dependencies
with publication credentials. GitHub OIDC signs provenance and per-architecture
SBOM attestations. A signed multi-architecture index binds the two architectures;
the signed release manifest binds all three index digests and the chart bytes.

The production API and worker use digest-pinned Alpine images. In addition to the
interpreter, the canonical runtime updater refreshes these pins and the verified
npm/pip/uv build tools. A distribution change must pass the image tests: native
Python wheels, PostgreSQL, FFmpeg, auth and the Kubernetes lifecycle. OS package
versions are captured in the SBOM; a rebuild is a new artifact even at the same
source commit. Release runs and attempts use distinct registry tags. Installation
always uses digests.

`On-prem Validation` runs on selected changes and daily against current main,
building and scanning images and exercising a disposable Kubernetes environment.
A daily failure requires triage; it does not approve or deploy a replacement.
Every release also verifies the signed artifacts and runs the Kubernetes rehearsal
on a fresh hosted runner. A successful release run therefore includes this staging
check. Production promotion remains operator-approved.

Existing dependency and runtime PR automation remains the review path for source
changes. No blanket `ignore-unfixed` or CVE ignore file is used.

## Download and verify a specific release

Use a recent authenticated GitHub CLI with `gh attestation verify`, Python 3.9+
and Helm 4.3.1. Run the verifier from your reviewed checkout, rather than from an
unverified downloaded bundle. Select a successful `On-prem Release` run and
independently review its full source SHA. Do not derive the trusted SHA from the
manifest being checked.

```sh
SOURCE_SHA=REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT
RUN_ID=REPLACE_WITH_SUCCESSFUL_RELEASE_RUN
mkdir -p /secure/videoq-release
gh run download "$RUN_ID" --repo yukiharada1228/videoq \
  --name "onprem-release-$SOURCE_SHA" --dir /secure/videoq-release
python3 .github/scripts/onprem-release.py verify "$SOURCE_SHA" \
  /secure/videoq-release/release.json /secure/videoq-release/verified-images.json
```

For private GHCR packages, authenticate to GHCR first using an appropriately
scoped operator credential. The verifier checks GitHub's signature and artifact
subject, the exact repository and release workflow, `refs/heads/main`, the source
commit and hosted-runner identity. It verifies the manifest, chart checksum and
signature, and all image index signatures before atomically writing any values.
A missing signature, altered chart, different source or unexpected repository
aborts verification and preserves existing values. Per-architecture SBOM
attestations can also be inspected using `gh attestation verify` with predicate
`https://cyclonedx.org/bom`. Preserve the chart, release manifest, verified values,
SBOMs and attestation bundles in your artifact archive; workflow downloads expire
after 90 days. Registry retention must preserve promoted digests and attestations.

Merge the generated image values **last** so site settings cannot accidentally
replace the reviewed digests:

```sh
helm template videoq /secure/videoq-release/videoq-0.1.0-sha.$SOURCE_SHA.tgz \
  -n videoq -f /secure/site.yaml -f /secure/videoq-release/verified-images.json
helm upgrade --install videoq /secure/videoq-release/videoq-0.1.0-sha.$SOURCE_SHA.tgz \
  -n videoq -f /secure/site.yaml -f /secure/videoq-release/verified-images.json \
  --wait --timeout 15m
helm test videoq -n videoq --timeout 2m
```

The chart enforces digests but does not itself enforce signatures. The verifier
is an operator-side gate; a cluster administrator can bypass it. If that must be
prevented, add a site-owned admission policy for the same signer identity.

## Staging and promotion

Start with a separate staging namespace and backing services. Record the source
commit, release run ID, chart checksum, image digests, site-values revision and
migration version in the site's change record. Verify the release, rehearse an
upgrade with a representative backup, and check upload, transcription, indexing,
cited Q&A, SSE and timestamp playback. Production promotion requires an operator
approval of this concrete set of artifacts and the migration/restore plan.

A GitOps repository can store `verified-images.json` in a reviewable PR after
verification. Let the staging controller reconcile approved values, then promote
the same digests to production after approval. Do not auto-promote a mutable tag
or regenerate a production Secret from release metadata. No site deployment or
GitOps credentials are configured in this repository while the target is unset.

## Reproduce the local lifecycle rehearsal

Build the three application images as `videoq-api:onprem-ci`,
`videoq-worker:onprem-ci` and `videoq-web:onprem-ci`. Then, with Docker, kind,
kubectl, Helm, Node and Python available:

```sh
kind create cluster --name videoq-onprem-lab --kubeconfig /tmp/videoq-lab-kubeconfig
HELM_BIN=helm python3 .github/scripts/onprem-lab.py \
  /tmp/videoq-lab-kubeconfig /tmp/videoq-lab-results
kind delete cluster --name videoq-onprem-lab --kubeconfig /tmp/videoq-lab-kubeconfig
```

The script restricts kubectl to that dedicated context. It creates disposable
PostgreSQL/pgvector, Garage, ElasticMQ and a deterministic inference HTTP fixture
outside the application chart. It exercises real uploads, FFmpeg audio extraction,
queue delivery, transcript storage, vector indexing, cited Q&A and SSE; then S3
object backup/delete/restore with checksum comparison, a database dump restored
to a separate database, application reconnection, a two-replica upgrade, Helm
tests and a one-replica rollback retaining the restored data. It writes
`result.json` only after all checks pass. Results and database dumps are local
artifacts; do not commit credential-bearing database dumps.

This rehearsal tests application and protocol integration. Real inference model
quality, GPU sizing, TLS/ingress, storage and queue persistence across host loss,
and the site's backup RPO/RTO require validation in the eventual target site.
