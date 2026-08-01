#!/usr/bin/env python
"""PoC #03 — Django/SimpleJWT が発行する実トークンと API キーハッシュを生成。

Worker(jose/WebCrypto) が同一に検証できるか（＝カットオーバーで既存セッションが切れないか）を
確認するための入力を作る。SECRET_KEY は出力しない（別途 env で node へ渡す）。

実行（backend の venv で）:
    cd backend
    DJANGO_SETTINGS_MODULE=videoq.settings .venv/bin/python \
        ../poc/worker-auth-cutover/gen_token.py
"""
import json
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from rest_framework_simplejwt.tokens import AccessToken  # noqa: E402

from app.infrastructure.models.api_key import UserApiKey  # noqa: E402

USER_ID = 123

# 実際の SimpleJWT アクセストークン（HS256 + SECRET_KEY, 標準クレーム）。DB 不要。
t = AccessToken()
t["user_id"] = USER_ID
token = str(t)

# API キー（実際の生成規則）とサーバ保存ハッシュ（SHA-256 hexdigest）。
raw_key = UserApiKey.generate_raw_key()          # "vq_..."
key_hash_py = UserApiKey.hash_key(raw_key)        # hashlib.sha256(...).hexdigest()

out = {
    "user_id": USER_ID,
    "access_token": token,
    "token_claims_sample": {k: t.payload.get(k) for k in ("token_type", "user_id", "exp", "iat", "jti")},
    "api_key": raw_key,
    "api_key_hash_py": key_hash_py,
    "jwt_algorithm": settings.SIMPLE_JWT.get("ALGORITHM", "HS256 (default)"),
    "secret_key_len": len(settings.SECRET_KEY),
}
Path("/tmp/poc03.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print("wrote /tmp/poc03.json")
print("token_type=", out["token_claims_sample"]["token_type"], " user_id=", out["token_claims_sample"]["user_id"])
print("api_key prefix=", raw_key[:6] + "...", " hash(py, sha256)=", key_hash_py[:16] + "...")
