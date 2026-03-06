# バックエンド Clean Architecture レビュー（2026-03-06）

## Findings（重要度順）

### Low-1: DI ライフサイクル方針が `chat` 以外で未統一
- 箇所:
  - `backend/app/composition_root/chat.py:1-6,39-54`
  - `backend/app/composition_root/video.py:41-159`
  - `backend/app/composition_root/auth.py:35-107`
- 内容:
  - `chat` では「Repository は都度生成、外部 stateless service は `lru_cache` で再利用」という方針がコード化されている。
  - 一方 `video` / `auth` では同等のスコープ方針が明示されておらず、基本的に都度 `new`。
- 影響:
  - 現時点で違反ではないが、重い依存（外部 API クライアントやベクトル検索系）追加時に初期化コスト・設定一貫性・テスト差し替えの設計判断がコンテキストごとに分散しやすい。
- 提案:
  - `composition_root` 全体でスコープ方針（request/process/singleton）を明文化し、必要な依存のみ `factory` と `cached provider` を使い分ける。

### Low-2: `admin.py` の依存境界に対するテストガードが最小限
- 箇所:
  - `backend/app/tests/test_import_rules.py:506-513`
  - `backend/app/admin.py:1-166`
- 内容:
  - 現在の `admin` 向けガードは「`app.presentation.tasks` を import しない」「`app.composition_root` を直接 import しない」の 2 点。
  - `admin` が将来 `app.use_cases` や `app.infrastructure` を直接 import しても、現状のルールでは検知できない余地がある。
- 影響:
  - 境界逸脱が徐々に混入した場合、`admin -> dependencies -> composition_root` の経路一貫性が崩れる可能性。
- 提案:
  - `admin.py` に対して `app.use_cases` / `app.infrastructure` 直接 import 禁止の単体チェックを追加し、許可経路を明確化する。

## 良い点（Clean Architecture 観点）
- 依存方向の禁止ルールがテストで明文化されている。
  - `backend/app/tests/test_import_rules.py:1-620`
- ドメイン層がフレームワーク非依存（dataclass 中心）で維持されている。
  - `backend/app/domain/video/entities.py:1-88`
- ユースケース層がドメインポート経由で実装され、ORM 直接依存を避けている。
  - `backend/app/use_cases/video/create_video.py:1-75`
- プレゼンテーション層は HTTP/バリデーションに集中し、UseCase 呼び出しへ委譲している。
  - `backend/app/presentation/video/views.py:1-260`
- タスク entrypoint も `dependencies` 経由で UseCase を解決している。
  - `backend/app/entrypoints/tasks/transcription.py:1-35`

## 実行確認
- 実行コマンド: `cd backend && python -m unittest app.tests.test_import_rules -v`
- 結果: **56 tests passed / 0 failed**

## 総評
- バックエンドは **概ね Clean Architecture を満たしています**。
- 重大な依存方向違反は今回のレビュー範囲では確認されませんでした。
- 指摘 2 件は、今後の拡張時に設計劣化を防ぐためのガバナンス強化（方針統一・テスト補強）です。
