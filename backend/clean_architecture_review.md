# バックエンドのクリーンアーキテクチャレビュー

## 結論

このバックエンドは、ディレクトリ構成としては `presentation / use_cases / domain / infrastructure` に分かれており、クリーンアーキテクチャを志向した形にはなっています。

ただし、実装レベルでは依存規則が崩れている箇所が複数あり、現状は「部分的にクリーンアーキテクチャ風だが、厳密にはクリーンアーキテクチャではない」という評価です。

## 主な指摘事項

### 1. `domain` 層が Django モデルに直接依存している

- 重大度: High
- 根拠:
  - [app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py#L8)
  - [app/domain/chat/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/chat/repositories.py#L8)

`domain` 配下の repository interface が、抽象化のはずなのに `app.models` の Django モデル (`Video`, `Tag`, `ChatLog`, `VideoGroup` など) を型として使っています。さらに戻り値に `QuerySet` を含んでいます。

クリーンアーキテクチャでは、内側の層 (`domain`) は外側のフレームワークや ORM に依存しないのが前提です。ここでは domain interface 自体が Django ORM の型に縛られているため、依存方向が逆転できていません。

影響:

- ORM を差し替えにくい
- domain/use case の単体テストが Django モデル前提になる
- 「repository を抽象化しているようで、実質 Django の API を露出している」状態になる

### 2. `use_cases` 層が `infrastructure` や Django ORM を直接呼んでいる

- 重大度: High
- 根拠:
  - [app/use_cases/chat/send_message.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/send_message.py#L9)
  - [app/use_cases/video/update_video.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/update_video.py#L46)
  - [app/use_cases/auth/delete_account.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/auth/delete_account.py#L9)
  - [app/use_cases/auth/delete_account.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/auth/delete_account.py#L33)
  - [app/use_cases/video/manage_groups.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/manage_groups.py#L11)
  - [app/use_cases/video/manage_groups.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/manage_groups.py#L71)
  - [app/use_cases/chat/get_history.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/get_history.py#L25)
  - [app/use_cases/chat/get_analytics.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/get_analytics.py#L12)
  - [app/use_cases/chat/get_analytics.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/get_analytics.py#L41)
  - [app/use_cases/chat/get_popular_scenes.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/get_popular_scenes.py#L69)

`use_cases` 層の一部が、repository interface 経由ではなく、`app.models` の ORM や `app.infrastructure.external.*` を直接参照しています。

具体例:

- `SendMessageUseCase` が `RagChatService` を `infrastructure` から直接 import
- `UpdateVideoUseCase` が `vector_store` を直接 import
- `AccountDeletionUseCase` が `AccountDeletionRequest.objects.create(...)` と Celery task を直接実行
- `AddVideosToGroupUseCase` が `Video.objects.filter(...)` を直接使用
- `GetChatAnalyticsUseCase` が `ChatLog.objects.filter(...)` を直接使用
- `GetPopularScenesUseCase` が `Video.objects.filter(...)` を直接使用

これは「アプリケーションルールを持つ use case は、外側の実装詳細を interface 越しに使う」という原則に反します。現在の use case は orchestration と実装詳細が混在しており、層の独立性が弱いです。

### 3. `presentation` 層がユースケースを経由せず、repository や ORM を直接扱っている

- 重大度: Medium
- 根拠:
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L97)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L249)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L288)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L455)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L474)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L498)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L523)
  - [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L551)
  - [app/presentation/chat/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py#L80)
  - [app/presentation/chat/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py#L95)

一部のエンドポイントは use case を使っていますが、他は view 内で repository を直接生成して CRUD を実行したり、ORM クエリを直接組み立てています。

具体例:

- `VideoGroupListView` / `VideoGroupDetailView` は use case なしで repository を直接操作
- `TagListView` / `TagDetailView` は use case なしで repository や ORM を直接操作
- `BaseTagView` は直接 `Tag.objects...`
- `VideoListView.get_queryset()` は filtering / ordering ロジックを view 側で再実装
- `ChatView` は shared access の group 解決を view 側で一部実施

これにより business rule が controller に分散し、同じ関心事が view / use_case / repository に重複しています。特に `VideoListView.get_queryset()` の条件分岐は、`DjangoVideoRepository.list_for_user()` と責務が重なっています。

### 4. repository interface が `QuerySet` を境界の外に漏らしている

- 重大度: Medium
- 根拠:
  - [app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py#L29)
  - [app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py#L70)
  - [app/domain/video/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/video/repositories.py#L133)
  - [app/domain/chat/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/chat/repositories.py#L17)
  - [app/domain/chat/repositories.py](/Users/yukiharada/dev/videoq/backend/app/domain/chat/repositories.py#L49)
  - [app/use_cases/chat/get_history.py](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/get_history.py#L23)

repository の戻り値に `QuerySet` を返しているため、永続化の遅延評価や ORM 特有の操作が上位層へ伝播します。

クリーンアーキテクチャなら、境界を越えるデータは entity / DTO / 明示的な collection に寄せる方が自然です。`QuerySet` を返すと、上位層が暗黙に Django ORM の挙動を前提にしやすくなります。

## 良い点

- レイヤーごとのディレクトリ分割はされている
- `use_cases` を経由する実装が一部存在する
  - 例: [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L141)
  - 例: [app/presentation/video/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/video/views.py#L309)
  - 例: [app/presentation/chat/views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py#L114)
- `infrastructure/repositories` に Django 実装を分離しようとしている
  - 例: [app/infrastructure/repositories/django_video_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_video_repository.py#L21)
  - 例: [app/infrastructure/repositories/django_chat_repository.py](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_chat_repository.py#L11)
- `domain` 配下にサービス (`ShareLinkService`, chat 集計ロジック) を置いており、純粋ロジックを寄せる方向性はある

## 総合評価

- 形式上: クリーンアーキテクチャを意識した構成
- 実態: レイヤード Django アプリ + 一部ユースケース分離
- 判定: 厳密なクリーンアーキテクチャではない

特に問題なのは、`domain` と `use_cases` の内側の層が Django モデル・ORM・外部サービス実装に直接触っている点です。これがある限り、「層がある」ことと「依存が内向きである」ことが一致していません。

## 改善優先順位

### 優先度 1

- `domain` の repository interface から Django モデル型と `QuerySet` を外す
- `use_cases` から `app.models` 直接参照をなくし、必要な取得・更新は repository interface に寄せる
- `use_cases` から `app.infrastructure.external.*` 直参照をなくし、gateway / service interface を挟む

### 優先度 2

- `presentation` で直接 repository を触っている箇所を use case 経由に統一する
- view にある filtering / authorization / shared-access 解決ロジックを use case に寄せる

### 優先度 3

- use case の戻り値を `QuerySet` ではなく DTO や明示的な結果オブジェクトにする
- 依存規則を壊す import を検出する簡易テストや lint ルールを追加する

## 改善の方向性

例えば以下のように整理すると、よりクリーンアーキテクチャに近づきます。

- `domain`: entity / value object / repository interface / domain service
- `use_cases`: input DTO, output DTO, repository interface, gateway interface を使って orchestration のみ担当
- `infrastructure`: Django ORM 実装、Celery 実装、LLM 実装、Vector Store 実装
- `presentation`: serializer で入力検証し、use case を呼ぶだけにする

この構成であれば、Django・Celery・LLM 実装は差し替え可能な詳細になり、アプリケーションルールが内側に残ります。
