# PoC #04: quota・アップロード競合（原子的予約の Worker 移行）

- 種別: 移行 PoC 手順・結果
- 対象: 要件定義書 §5.7（FR-Q1〜Q5）
- 関連: [移行要件定義書](./cloudflare-hono-migration-requirements.md) / [PoC #01](./poc-01-pgvector-cross-runtime-search.md)
- 作成日: 2026-08-01
- スクリプト: [`poc/worker-hyperdrive-pg/`](../../poc/worker-hyperdrive-pg/)（`/reserve` `/release`）

## 1. 目的

現行 quota 予約（`check_and_reserve_storage`）は Django の**単一・原子的な条件付き UPDATE**で並行超過を防いでいる。これを Hono Worker の**生 SQL over Hyperdrive**に移したとき、**並行アップロードで quota を超過予約しないか**を実測する。

## 2. 現行実装（`django_subscription_repository.py`）

```python
updated = User.objects.filter(
    pk=user_id, used_storage_bytes__lte=limit - additional_bytes,
).update(used_storage_bytes=F("used_storage_bytes") + additional_bytes)
if updated == 0:
    raise StorageLimitExceeded(...)
```
= 単一 UPDATE（Postgres 行ロックで原子的）:
```sql
UPDATE app_user SET used_storage_bytes = used_storage_bytes + $add
WHERE id = $uid AND used_storage_bytes <= $limit - $add;   -- 0 行更新 → 超過で例外
```
- 予約は署名 URL 発行時に**申告サイズを先取り**（`request_video_upload.py`）。`limit is None` は無制限（加算のみ）。`is_over_quota` は先にチェック。
- quota フィールド: `storage_limit_gb`/`used_storage_bytes`/`processing_*`/`ai_answers_*`（既定 0）、`usage_period_start`、`is_over_quota`。

## 3. 実測結果（2026-08-01, ローカル DB, 実 `app_user` 非汚染の `poc_quota` で検証）

Worker（workerd + pg + Hyperdrive[local]）に、同じ条件付き UPDATE を生 SQL で実装（`used + size <= limit` のときだけ加算, `RETURNING` で成否判定）。`limit=100` の 1 行に**並行 HTTP リクエスト**を集中。

| テスト | 条件 | 期待 | 実測 |
|---|---|---|---|
| 逐次サニティ | size=30 を 4 回 | 3 成功 / 4 回目失敗 | ✅ used 30→60→90, 4 回目 reserved=false |
| **並行 A** | size=30 を **20 並行** | 成功 3 / used=90 / 超過なし | ✅ **成功 3・used=90・≤100** |
| **並行 B** | size=15 を **30 並行** | 成功 6 / used=90 / 超過なし | ✅ **成功 6・used=90・≤100** |
| 放棄解放 | reserve30→release30→release30 | 0 未満にならない | ✅ 30→0→0（`GREATEST(0, used-size)` でクランプ） |

### 結論
- **原子的予約は Worker の生 SQL over Hyperdrive で完全に保たれる**。並行アップロードでも `floor(limit/size)` 件だけ成功し、`used` は `limit` を超えない。**Django ORM の `F()` + 条件付き UPDATE を単一 UPDATE 文へ 1:1 移植すれば race-free**（`transaction.atomic()` ブロックは不要 — 予約は元々単一 UPDATE）。
- 放棄解放（現行に無い追加分）は `GREATEST(0, used - size)` のクランプ減算で安全に実装できる。

## 4. 要件 §5.7 への反映

- **FR-Q2（原子的予約）: Worker 移行可能を実測確認**。実装は単一の条件付き UPDATE（`RETURNING` 有無で成否判定）。ORM の暗黙 atomic に依存しない。
- **FR-Q3（放棄解放）: 現行に無いギャップ**。署名 URL 発行時に先取り予約するが、アップロード放棄時の解放が無い（＝quota が減らないまま残る）。→ 移行時に (a) confirm 失敗/タイムアウトでの解放、または (b) R2 未着オブジェクトの reconciliation cron で `GREATEST(0, used-size)` 解放を**新規実装**。本 PoC で解放パターンの安全性を確認済み。
- **FR-Q4/Q5（記録失敗の握り潰し・遅延月次リセット）**: 設計判断事項（ベストエフォート維持 or 補償/cron 化）。`reset_monthly_usage` も単一 UPDATE で移植容易。

## 5. 安全上の注意

- 実 `app_user` は一切変更せず、専用 `poc_quota` テーブルで検証（検証後 DROP 済み）。
- wrangler dev はローカル、socat 転送も検証後削除。
