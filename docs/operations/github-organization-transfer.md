# GitHub organization transfer

Destination: `videoq-jp/videoq`, repository ID `1083911938`.
The dependency GitHub App must also be owned by `videoq-jp` and remain private.
Its App ID and private key are retained; do not create a replacement bot identity.

## Preparation

- Save repository settings, protection, environments, variable values and secret
  names before transfer. Secret values cannot be read back through GitHub APIs.
- Add the exact destination subjects in the IAM trust templates to the existing
  plan and deploy roles. Preserve existing subjects during the transition. Never
  use a wildcard for repository owners. No permission policy change is needed.
- Test this change on its PR before merging. Canonical automation guards switch
  to the destination, so merge immediately before transfer: production and bot
  jobs on the old owner will stop deliberately until transfer is complete.
- Preserve required checks and administrator enforcement throughout the move.

## Transfer and restore

1. Merge the reviewed migration PR after all required checks pass.
2. Transfer the repository to `videoq-jp`. Confirm its repository ID is unchanged,
   update the Git remote, and compare settings and environment protection with
   the saved snapshot. Confirm repository secrets and variables are present.
3. In the existing App registration's **Advanced** page, transfer ownership to
   `videoq-jp`. A private App's personal installation can be removed by this
   operation; perform it during this cutover, not during normal operation.
4. Install the transferred App on **Only select repositories: videoq**. Confirm
   App ID `5420589` remains unchanged. Name the App `videoq-dependency-bot`;
   controller and publisher derive its bot login from the authenticated App slug.
5. Run CI on destination main. Verify the exact main commit passes CI and that
   the normal deployment workflows assume their AWS roles successfully. PR and
   merge-group runs must never deploy production or receive deploy credentials.
6. Initialize the new GHCR namespaces with **Package Namespace Bootstrap**, using
   a successful historical On-prem Release run and its exact signed artifact.
   Bootstrap both the application images and `videoq-vllm`; the latter needs the
   separate `vllm_only` dispatch. Confirm package visibility is public and the
   repository has Actions write access, then run the normal signed release.
   Bootstrap tags are migration artifacts, not signed deployable releases.
7. Confirm the Codecov installation and its repository access on the destination.
   Validate actual uploads; do not assume personal installations move with it.

Historical release metadata remains valid only for the exact historical owner,
image namespaces, signer workflow, source commit and signed subjects. New releases
must use the new owner. Never globally rewrite historical release manifests.

After transfer, historical attestations are retrieved from the original owner's
attestation store. The verifier downloads each bundle there and then verifies it
locally with the same exact repository, signer workflow, source ref, source SHA
and hosted-runner requirements. A missing bundle or failed verification stops
bootstrap; changing lookup scope does not relax the signature policy.

The repository's OIDC API reports immutable subjects with prefix
`repo:videoq-jp@349188820/videoq@1083911938`. Trust these exact destination subjects;
name-only destination subjects do not authorize its current tokens. Validate main
and PR planning plus production deployment before removing transition subjects.

## Native merge queue cutover

The required CI, container and Terraform workflows handle `merge_group` events.
Their change detection uses the group's base SHA. Terraform merge groups only
validate with backend disabled; AWS planning remains restricted to same-repository
PRs with the existing Dependabot exclusions.

The controller selects native operation with repository variable
`DEPENDENCY_QUEUE_MODE=native`. In that mode, CI admission no longer reads an issue
lease, and the controller does not rebase branches just because main advances.
It reserves native queue entries only after all real PR validation workflows pass
and it independently verifies the branch's native queue protection.

For cutover, briefly set `DEPENDENCY_AUTOMERGE_ENABLED=false`, merge the native
controller change, and install `.github/native-merge-queue.json` through the
repository ruleset API. Replace the custom queue required check with the four real
validation checks, set strict up-to-date checking to false, retain administrator
enforcement, set `DEPENDENCY_QUEUE_MODE=native`, then restore auto-merge and dispatch
the controller once. Do not clear required checks during this transition. Normal
developer PRs also use GitHub's native queue when the rule applies to main.

Existing bot PRs created before the owner change need one explicit controller
dispatch with their PR number in `retry` to incorporate the new workflow policy.
This is a one-time cutover step, not a recurring main synchronization loop.

The native configuration builds one merge group at a time, with one PR in it and
merge commits preserving parent ancestry. This avoids speculative builds being
invalidated by preceding PRs. A proven group failure can sync only its current PR
to reproduce the problem in normal PR CI. Group origin, workflow identity, current
head ancestry and bot provenance are checked before that mutation. Reproduction
is bounded to two attempts per PR; the existing Claude security and repair limits
remain independent. No polling schedule is needed.

Completion requires an actual automatic update PR to enter the native queue,
pass checks on its synthetic commit, and merge without manual main rebasing.
Keep Claude's bounded, provenance-checked repair path for eligible failed updates.

After destination deployment, App operations and signed releases are proven,
remove the old-owner IAM subjects and temporary migration settings. Do not recreate
the old personal repository, which would break GitHub's repository redirects.
