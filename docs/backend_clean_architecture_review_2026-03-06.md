# バックエンド クリーンアーキテクチャレビュー (2026-03-06)

## 結論
- 全体としては **クリーンアーキテクチャに概ね準拠** しています。
- `domain -> use_cases -> presentation/infrastructure` の依存方向は、実装とテストの両方でかなり強く守られています。
- ただし、チャットユースケース周辺に「境界の型安全性」と「エラー分類」の観点で改善余地があります。

## Findings (重大度順)

### 1. [Medium] `SendMessageUseCase` の境界型が `Dict` ベースで、アプリケーション境界が弱い
- 該当: `app/use_cases/chat/send_message.py`
- 根拠:
  - `messages: List[Dict]` を受け取っている (`:49`)
  - 戻り値 `related_videos: Optional[List[Dict]]` (`:22`)
  - `_related_videos_to_dicts` で DTO と dict を混在処理 (`:129-139`)
- 影響:
  - ユースケースが HTTP/payload 形状に引きずられやすくなり、境界の明確性が下がる。
  - 将来の仕様変更時に、presentation と use_cases の責務が混ざりやすい。
- 改善案:
  - ユースケース入出力を DTO に統一し、dict 変換は presentation/infrastructure 側アダプタに寄せる。

### 2. [Medium] `user_id` の nullability が UseCase と Gateway 契約で不一致
- 該当:
  - `app/use_cases/chat/send_message.py`
  - `app/domain/chat/gateways.py`
  - `app/infrastructure/external/rag_gateway.py`
- 根拠:
  - UseCase は `user_id: Optional[int]` を受ける (`send_message.py:48`)
  - それをそのまま `RagGateway.generate_reply(... user_id=owner_user_id ...)` に渡す (`send_message.py:90-93`)
  - Gateway 契約は `user_id: int` を要求 (`gateways.py:37`)
  - 実装側は `User.objects.get(pk=user_id)` を即実行 (`rag_gateway.py:28`)
- 影響:
  - 将来的な呼び出し経路の変化で `None` が流入した場合、境界で明示エラー化されずインフラ側例外に化けるリスクがある。
- 改善案:
  - UseCase 側で `owner_user_id` 非 null を保証し、未満たし時は use_cases 例外を投げる。
  - もしくは Gateway 契約を Optional に変更し、責務を明文化する（現状は前者推奨）。

### 3. [Low] `RagChatGateway` の広域例外捕捉で障害原因の粒度が落ちる
- 該当: `app/infrastructure/external/rag_gateway.py`
- 根拠:
  - `except Exception as exc: raise LLMProviderError(...)` (`:44-45`)
- 影響:
  - 外部API障害と実装バグ/データ不整合が同一カテゴリ化され、運用時の切り分けが難しくなる。
- 改善案:
  - 外部依存由来の例外を優先的に明示変換し、予期しない例外はそのまま上げるか別クラスで分類する。

## 強み（準拠できている点）
- 層ごとの import ルールが明文化され、CIテストで担保されている。
  - `app/tests/test_import_rules.py`
- 実際に import ルールテストは全件成功:
  - `docker compose run --rm backend python manage.py test app.tests.test_import_rules -v 2 --keepdb`
  - 結果: `Ran 36 tests ... OK`
- DI 配置も明確:
  - `composition_root` で実装注入
  - `dependencies` は presentation/task entrypoint からの参照点として薄く維持

## 総評
- 現状は「運用可能なクリーンアーキテクチャ」レベルに達しています。
- 次に質を上げるなら、チャットユースケースの DTO 境界統一と nullability 契約の整合を優先するのが効果的です。
