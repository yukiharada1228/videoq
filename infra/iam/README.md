# GitHub Actions OIDC roles

GitHub Actions は固定アクセスキーを保存せず、GitHub OIDCから短期AWS
credentialsを取得する。pull requestから本番を変更できないよう、planとdeployは別のIAM
roleに分ける。

- `videoq-github-actions-plan`: pull requestだけが引き受け可能。AWS managed
  `ReadOnlyAccess`と、stateの読み取り・lock操作だけを許可する。
- `videoq-github-actions-deploy`: mainまたは`production-infra` environmentだけが引き受け
  可能。本番のapplyとLambda deployに使う。

役割ごとのカスタマーマネージドポリシーは4分割している。`<ACCOUNT_ID>` は実アカウント
ID（public repositoryに含めないためプレースホルダ）に置換して適用する。

| ポリシー | 役割 | 使うワークフロー |
|---|---|---|
| `videoq-tfstate-plan` | Terraform stateの読み取り + lock objectだけの更新 | terraform-plan |
| `ReadOnlyAccess` (AWS managed) | planのrefreshに必要なAWSリソースの読み取り | terraform-plan |
| `videoq-tfstate-access` | Terraform state (S3 バケット) + `sts:GetCallerIdentity` | terraform-apply |
| `videoq-backend-cd` | ECR へイメージ push + Lambda コード更新 | cd.yml |
| `videoq-terraform-deploy` | インフラの CRUD | terraform-apply |

スコープ方針: `iam`/`PassRole` は `videoq-*` ロール限定、SSM は
`parameter/videoq/prod/*`、SQS/Lambda/ECR は該当リソース限定。旧 Secrets Manager
削除用の限定権限も `videoq-terraform-deploy` に含む。

## 初回適用手順

AWS IAMでGitHub OIDC providerを作成していない場合は、provider URLに
`https://token.actions.githubusercontent.com`、audienceに`sts.amazonaws.com`を指定して
作成する。その後、次を一度だけ実行する。

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

GitHub repository secretに次を設定する。

- `AWS_GITHUB_ACTIONS_PLAN_ROLE_ARN`:
  `arn:aws:iam::<ACCOUNT_ID>:role/videoq-github-actions-plan`
- `AWS_GITHUB_ACTIONS_DEPLOY_ROLE_ARN`:
  `arn:aws:iam::<ACCOUNT_ID>:role/videoq-github-actions-deploy`

ワークフローの動作確認後、旧`AWS_GITHUB_ACTIONS_ROLE_ARN`、
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secretsとIAM userのaccess keyを削除する。

## 更新手順 (ポリシー変更時)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
p=videoq-terraform-deploy   # 変更したポリシー名
sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" "infra/iam/${p}.json" > "/tmp/${p}.json"
aws iam create-policy-version \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${p}" \
  --policy-document "file:///tmp/${p}.json" --set-as-default
# 版が 5 個に達したら古い版を delete-policy-version で削除
```

> リージョンは `ap-northeast-1` を前提にハードコードしている。別リージョンで使う
> 場合は各 JSON の ARN を書き換えること。
