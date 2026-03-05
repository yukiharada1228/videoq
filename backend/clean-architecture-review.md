# バックエンド クリーンアーキテクチャレビュー

作成日: 2026-03-05

## 結論
- 現状は「クリーンアーキテクチャ寄りのレイヤード構成」
- `domain/use_cases/infrastructure/presentation` の分離はできている
- ただし、厳密なクリーンアーキテクチャとしては境界漏れがあり、部分的に未達

## 指摘事項（優先順）

### 1. ユースケース層の横断依存（Medium）
- `chat` / `auth` ユースケースが `video` ユースケース配下の例外に依存
- 例:
  - `/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/send_message.py:10`
  - `/Users/yukiharada/dev/videoq/backend/app/use_cases/auth/manage_api_keys.py:9`
  - `/Users/yukiharada/dev/videoq/backend/app/use_cases/video/exceptions.py:14`
- 影響:
  - 機能間の結合が強まり、変更波及しやすい
- 改善案:
  - 共有例外を `app/use_cases/shared/exceptions.py` などへ移動

### 2. Presentation 層が domain gateway 例外を直接処理（Medium）
- 例:
  - `/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py:24`
  - `/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py:104`
- 影響:
  - HTTP 層が内部実装由来の失敗理由を知る必要があり、差し替え耐性が下がる
- 改善案:
  - UseCase でアプリケーション例外へ変換し、Presentation はその例外のみを扱う

### 3. Domain サービスのライブラリ直接依存（Low）
- 例:
  - `/Users/yukiharada/dev/videoq/backend/app/domain/chat/services.py:24`
  - `/Users/yukiharada/dev/videoq/backend/app/domain/chat/services.py:43`
- 影響:
  - ドメイン純度・テスト容易性・差し替え性が低下
- 改善案:
  - キーワード抽出をポート化し、実装を infrastructure 側へ分離

### 4. Import ルールは有効だが横断依存を検知できない（Low）
- 参照:
  - `/Users/yukiharada/dev/videoq/backend/app/tests/test_import_rules.py:82`
- 影響:
  - 層違反は防げるが、`use_cases` 内コンテキスト間の不要結合を防げない
- 改善案:
  - `app/use_cases/<context>` 間 import 禁止ルールの追加

## テスト実行結果（Docker）

実行日: 2026-03-05

実行コマンド:

```bash
docker compose exec backend python manage.py test app/tests --verbosity 2
```

結果:
- `app/tests/test_import_rules.py` の 4 テストが全件成功
- サマリー: `Ran 4 tests ... OK`
