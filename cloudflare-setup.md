# Cloudflare Tunnel セットアップガイド

## 1. Cloudflare Tunnel の作成

### 1.1 Cloudflare Dashboard でトンネルを作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 「Zero Trust」→「Access」→「Tunnels」に移動
3. 「Create a tunnel」をクリック
4. トンネル名を入力（例：`videoq-tunnel`）
5. 「Save tunnel」をクリック

### 1.2 トークンを取得

1. 作成したトンネルを選択
2. 「Install and run a connector」タブを選択
3. 「Docker」を選択
4. 表示されるトークンをコピー（`CLOUDFLARE_TUNNEL_TOKEN`）

## 2. 環境変数の設定

`.env` ファイルに以下を追加：

```bash
# Cloudflare Tunnel settings
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token_here
```

## 3. アプリケーションの起動

```bash
# Cloudflare Tunnel付きで起動
docker-compose -f docker-compose.cloudflare.yml up -d

# または、通常のdocker-compose.ymlを編集してcloudflaredサービスを追加
```

## 4. ルーティングの設定

### 4.1 Cloudflare Dashboard でルーティングを設定

1. トンネルの「Public Hostnames」タブを選択
2. 「Add a public hostname」をクリック
3. 以下の設定を行う：
   - **Subdomain**: `app`（または任意のサブドメイン）
   - **Domain**: `your-domain.com`
   - **Service**: `http://web:8000`
   - **Save**をクリック

### 4.2 カスタムドメインの設定（オプション）

独自ドメインを使用する場合：

1. Cloudflareにドメインを追加
2. DNSレコードを設定：
   - Type: `CNAME`
   - Name: `@`
   - Target: `your-tunnel-name.trycloudflare.com`

## 5. セキュリティ設定

### 5.1 SSL/TLS設定

1. Cloudflare Dashboard → SSL/TLS
2. 「Overview」タブで「Full (strict)」を選択
3. 「Edge Certificates」タブで「Always Use HTTPS」を有効化

### 5.2 ファイアウォール設定

1. Cloudflare Dashboard → Security → WAF
2. 適切なセキュリティルールを設定

## 6. 動作確認

```bash
# ログの確認
docker-compose -f docker-compose.cloudflare.yml logs cloudflared

# アプリケーションの状態確認
docker-compose -f docker-compose.cloudflare.yml ps
```

## 7. トラブルシューティング

### よくある問題

1. **トンネルが接続されない**
   - トークンが正しいか確認
   - ファイアウォール設定を確認

2. **アプリケーションにアクセスできない**
   - ルーティング設定を確認
   - webサービスが正常に起動しているか確認

3. **SSL証明書の問題**
   - CloudflareのSSL/TLS設定を確認
   - ドメインのDNS設定を確認

## 8. 本番環境での推奨設定

### 8.1 環境変数の追加

```bash
# 本番環境用の設定
DEBUG=False
ALLOWED_HOSTS=your-domain.com,*.your-domain.com
SECURE_SSL_REDIRECT=True
SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https')
```

### 8.2 ヘルスチェックの追加

```yaml
# docker-compose.cloudflare.yml に追加
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health/"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## 9. 監視とログ

### 9.1 ログの確認

```bash
# Cloudflare Tunnel のログ
docker-compose -f docker-compose.cloudflare.yml logs -f cloudflared

# アプリケーションのログ
docker-compose -f docker-compose.cloudflare.yml logs -f web
```

### 9.2 メトリクスの確認

- Cloudflare Analytics でトラフィックを監視
- Cloudflare Dashboard でトンネルの状態を確認 