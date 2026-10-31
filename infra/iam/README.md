# GitHub Actions OIDC roles

GitHub Actions obtains temporary AWS credentials through GitHub OIDC without storing
static access keys. Planning and deployment use separate IAM roles so pull requests
cannot change production.

- `videoq-github-actions-plan`: Can be assumed by pull requests and main. Grants AWS-managed
  `ReadOnlyAccess` plus state read access and lock operations only.
- `videoq-github-actions-deploy`: Can be assumed only from main or the `production-infra`
  environment. Used for production applies and Lambda deployments.

Permissions are split across four customer-managed policies assigned to the roles.
Replace `<ACCOUNT_ID>` with the actual account ID before applying them; the placeholder
keeps the real ID out of the public repository.

The destination repository uses immutable GitHub OIDC subjects. Its prefix is
`repo:videoq-jp@349188820/videoq@1083911938`; the organization and repository IDs
are public identifiers, not AWS credentials. Confirm the current prefix with
`gh api repos/videoq-jp/videoq/actions/oidc/customization/sub` before changing trust.
Keep the audience restricted to `sts.amazonaws.com` and use only the exact PR,
main and production environment subjects in the templates. Do not switch the
repository back to name-only subjects to work around a trust mismatch.

| Policy | Purpose | Workflow |
|---|---|---|
| `videoq-tfstate-plan` | Read Terraform state and update only the lock object | terraform-plan |
| `ReadOnlyAccess` (AWS managed) | Read AWS resources needed to refresh the plan | terraform-plan |
| `videoq-tfstate-access` | Terraform state (S3 bucket) + `sts:GetCallerIdentity` | terraform-apply |
| `videoq-backend-cd` | Push images to ECR and update Lambda code | cd.yml |
| `videoq-terraform-deploy` | Infrastructure CRUD operations | terraform-apply |

Scope policy: `iam`/`PassRole` is limited to `videoq-*` roles; SSM is limited to
`parameter/videoq/prod/*`; SQS/Lambda/ECR permissions are limited to the relevant
resources. `videoq-terraform-deploy` also includes narrowly scoped permissions to
delete legacy Secrets Manager resources.

## Initial setup

If a GitHub OIDC provider does not yet exist in AWS IAM, create one with
`https://token.actions.githubusercontent.com` as the provider URL and
`sts.amazonaws.com` as the audience. Then run the following once:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PLAN_ROLE=videoq-github-actions-plan
DEPLOY_ROLE=videoq-github-actions-deploy

sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" \
  infra/iam/videoq-github-actions-plan-trust.json > /tmp/videoq-github-actions-plan-trust.json
aws iam create-role --role-name "$PLAN_ROLE" \
  --assume-role-policy-document file:///tmp/videoq-github-actions-plan-trust.json

sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" \
  infra/iam/videoq-github-actions-trust.json > /tmp/videoq-github-actions-trust.json
aws iam create-role --role-name "$DEPLOY_ROLE" \
  --assume-role-policy-document file:///tmp/videoq-github-actions-trust.json

for p in videoq-tfstate-plan videoq-tfstate-access videoq-backend-cd videoq-terraform-deploy; do
  sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" "infra/iam/${p}.json" > "/tmp/${p}.json"
  aws iam create-policy --policy-name "$p" --policy-document "file:///tmp/${p}.json"
done

aws iam attach-role-policy --role-name "$PLAN_ROLE" \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/videoq-tfstate-plan"
aws iam attach-role-policy --role-name "$PLAN_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

for p in videoq-tfstate-access videoq-backend-cd videoq-terraform-deploy; do
  aws iam attach-role-policy --role-name "$DEPLOY_ROLE" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${p}"
done
```

Set the following GitHub repository secrets:

- `AWS_GITHUB_ACTIONS_PLAN_ROLE_ARN`:
  `arn:aws:iam::<ACCOUNT_ID>:role/videoq-github-actions-plan`
- `AWS_GITHUB_ACTIONS_DEPLOY_ROLE_ARN`:
  `arn:aws:iam::<ACCOUNT_ID>:role/videoq-github-actions-deploy`

After verifying the workflows, delete the legacy `AWS_GITHUB_ACTIONS_ROLE_ARN`,
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets and the IAM user's access key.

## Updating policies

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
p=videoq-terraform-deploy   # Name of the policy you changed
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" "infra/iam/${p}.json" > "/tmp/${p}.json"
aws iam create-policy-version \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${p}" \
  --policy-document "file:///tmp/${p}.json" --set-as-default
# Once there are 5 versions, remove an old version with delete-policy-version
```

> The region is hardcoded as `ap-northeast-1`. To use another region, update the
> ARNs in each JSON file.

## Neon database access

All production database jobs (migrations, smoke tests, backup/restore, public demo)
assume `videoq-github-actions-neon` using OIDC in `production-app`. This role can
read only `/videoq/security/prod/db-migration`, a JSON SecureString containing
`DATABASE_URL`. It cannot read the administrator parameter or change infrastructure.
The existing deployment role is not used for database access.

Apply the dedicated trust and inline permissions once, using an authenticated AWS
administrator session (the existing migration parameter must already exist):

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" infra/iam/videoq-github-actions-neon-trust.json > /tmp/videoq-neon-trust.json
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" infra/iam/videoq-neon-parameter-read.json > /tmp/videoq-neon-read.json
aws iam create-role --role-name videoq-github-actions-neon --assume-role-policy-document file:///tmp/videoq-neon-trust.json
aws iam put-role-policy --role-name videoq-github-actions-neon --policy-name videoq-neon-parameter-read --policy-document file:///tmp/videoq-neon-read.json
gh secret set AWS_GITHUB_ACTIONS_NEON_ROLE_ARN --repo videoq-jp/videoq --env production-app --body "arn:aws:iam::${ACCOUNT_ID}:role/videoq-github-actions-neon"
```

For an existing role use `aws iam update-assume-role-policy` instead of create-role.
The policy assumes the parameter uses the default AWS-managed `aws/ssm` key.
If it uses a customer-managed KMS key, also grant `kms:Decrypt` on that exact key,
restricted by `kms:ViaService` to `ssm.ap-northeast-1.amazonaws.com` and the
`kms:EncryptionContext:PARAMETER_ARN` to this exact parameter ARN; its key policy
must also permit the role.

Merge the workflow changes only after provisioning the role and Environment secret.
Run CD and the production operations workflows and verify successful OIDC role
assumption, SSM retrieval and database access before deleting the old secret:

```bash
gh secret delete DATABASE_URL --repo videoq-jp/videoq --env production-app
```

No database credential is stored in GitHub after this removal. The runner masks the
URL and password, passes `DATABASE_URL` only to the database command, and removes
AWS credentials and GitHub OIDC endpoint variables from that child process.
Neon still uses PostgreSQL password authentication; this change centralizes the
password in SSM rather than making the Neon connection passwordless.
