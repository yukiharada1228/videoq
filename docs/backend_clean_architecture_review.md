# バックエンド Clean Architecture レビュー

## 結論
概ねクリーンアーキテクチャに沿っています。

- レイヤ分離（`domain` / `use_cases` / `infrastructure` / `presentation` / `entrypoints`）は明確です。
- `domain/use_cases` から `infrastructure/presentation` への直接依存は確認できませんでした。
- ただし、**厳密な意味での「純粋」なクリーンアーキテクチャとしては未完了**で、主に「DTOとDIの境界設計」に改善余地があります。

総合評価: **7.5 / 10**

## Findings（重大度順）

### 1. Medium: UseCase出力DTOがPresentation実装都合に寄っている
- 根拠:
  - `VideoResponseDTO` のdocstringに「Serializers consume this via duck-typed attribute access」とあり、明示的にSerializer都合が入っています。  
    [app/use_cases/video/dto.py:84](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/dto.py:84)
  - `pk` プロパティを複数DTOに持たせており、DRF/Serializer互換の都合がUseCase側に混入しています。  
    [app/use_cases/video/dto.py:99](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/dto.py:99)  
    [app/use_cases/video/dto.py:133](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/dto.py:133)  
    [app/use_cases/video/dto.py:153](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/dto.py:153)
- 影響:
  - 外側の都合（HTTP Serializer）がアプリケーション境界へ逆流しやすくなります。
  - 非HTTPチャネル（CLI, gRPCなど）追加時にDTOの意味が曖昧化します。
- 改善案:
  - UseCase DTOを純粋な出力モデルにし、Serializer適合（`pk`等）はpresentationアダプタで吸収する。

### 2. Medium: 依存解決がService Locator寄りで、DIの明示性が弱い
- 根拠:
  - Viewが `app.dependencies.*` の関数を静的に参照し、その中でcomposition rootを呼び出す構造です。  
    [app/presentation/video/views.py:64](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py:64)  
    [app/dependencies/video.py:6](/Users/yukiharada/dev/videoq/backend/app/dependencies/video.py:6)
- 影響:
  - 依存関係が実行時解決に寄り、コンストラクタベースDIより追跡・差し替えがしにくくなります。
  - インスタンスライフサイクル（共有/使い捨て）が暗黙化しやすいです。
- 改善案:
  - View生成時にUseCaseを注入する形へ段階的に移行し、`dependencies` は移行層として縮小する。

### 3. Low: DomainポートにWebアップロード由来の形状が残っている
- 根拠:
  - Domain型 `UploadedFileLike` が `name/size/chunks/read` を要求しており、DjangoのUploadedFile形状に近い契約です。  
    [app/domain/video/types.py:10](/Users/yukiharada/dev/videoq/backend/app/domain/video/types.py:10)
  - `CreateVideoParams.file` がその型を直接受けます。  
    [app/domain/video/dto.py:32](/Users/yukiharada/dev/videoq/backend/app/domain/video/dto.py:32)
- 影響:
  - Domainが「入力媒体の都合」を知ってしまい、純粋なビジネス中心モデルから少し外れます。
- 改善案:
  - Domain側は `BinarySource` のようなより中立的な抽象に寄せ、Webファイルとの橋渡しはpresentation/infrastructureで行う。

## 良い点
- 明確な層構造と責務分離。
- `composition_root` による実装差し替えポイントがある。  
  [app/composition_root/video.py](/Users/yukiharada/dev/videoq/backend/app/composition_root/video.py)
- importルールをCIテストで強制しており、アーキテクチャ退行に強い。  
  [app/tests/test_import_rules.py](/Users/yukiharada/dev/videoq/backend/app/tests/test_import_rules.py)

## 補足（実行確認）
- `python manage.py test app.tests.test_import_rules -v 2` を実行しましたが、ローカル環境で `django` 未導入のため実行できませんでした。
- そのため本レビューは、主にコード静的確認に基づきます。
