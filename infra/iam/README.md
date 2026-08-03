# CI IAM ポリシー (videoq-github-actions-cd)

GitHub Actions が使う IAM ユーザー `videoq-github-actions-cd` に付与するカスタマー
マネージドポリシー。役割ごとに 3 分割している。`<ACCOUNT_ID>` は実アカウント ID
(public リポジトリに含めないためプレースホルダ) に置換して適用する。

| ポリシー | 役割 | 使うワークフロー |
|---|---|---|
| `videoq-tfstate-access` | Terraform state (S3 バケット) + `sts:GetCallerIdentity` | terraform-plan / terraform-apply |
| `videoq-backend-cd` | ECR へイメージ push + Lambda コード更新 | cd.yml |
| `videoq-terraform-deploy` | インフラの CRUD (plan の refresh / apply) | terraform-plan / terraform-apply |

スコープ方針: `iam`/`PassRole` は `videoq-*` ロール限定、SSM は
`parameter/videoq/prod/*`、SQS/Lambda/ECR は該当リソース限定。旧 Secrets Manager
削除用の限定権限も `videoq-terraform-deploy` に含む。

## 適用手順

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
USER=videoq-github-actions-cd

for p in videoq-tfstate-access videoq-backend-cd videoq-terraform-deploy; do
  sed "s/<ACCOUNT_ID>/${ACCOUNT_ID}/g" "infra/iam/${p}.json" > "/tmp/${p}.json"
  aws iam create-policy --policy-name "$p" --policy-document "file:///tmp/${p}.json"
  aws iam attach-user-policy --user-name "$USER" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${p}"
done
```

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
