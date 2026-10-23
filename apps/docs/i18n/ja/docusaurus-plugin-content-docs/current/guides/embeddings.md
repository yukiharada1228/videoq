---
title: 埋め込みの設定と検証
description: 1536次元固定の仕様、providerの設定、診断方法、モデル変更時の制約。
---

# 埋め込みの設定と検証

VideoQはシーンの埋め込みを `scene_embeddings.embedding vector(1536)` に保存します。API・Python workerの次元数は定数 `EMBEDDING_DIMENSIONS = 1536` で固定です。`EMBEDDING_VECTOR_SIZE` は廃止しました。環境に残っていても値によらず参照しません。この変更にDB migrationは不要です。

## 外部または社内の接続先を選ぶ

埋め込みは OpenAI 互換 API に統一しています。標準設定は次のとおりです。

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

社内の llama.cpp／vLLM も同じ形式を使い、接続先とモデル名を明示します。

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://embedding.intranet:8000/v1
EMBEDDING_API_KEY=local-inference
EMBEDDING_MODEL=gte-qwen2-1.5b-q4km-124fbdad
```

認証不要の社内サーバーでは仮のキーを使います。`EMBEDDING_API_KEY` が空なら
`OPENAI_API_KEY`、`EMBEDDING_BASE_URL` が空なら `OPENAI_BASE_URL` を使用するため、
埋め込みを別サービスに配置する場合は専用 URL を必ず設定してください。
Compose からホストの 8001 番ポートに接続する例は `http://host.docker.internal:8001/v1` です。
API・worker のモデル名と接続先を揃えます。LLM と Whisper の設定は独立しています。
[ローカル AI 推論](local-inference.md)も参照してください。

`POST /v1/embeddings` に `dimensions: 1536`、`encoding_format: float`、model、input を送ります。
llama.cpp 構成は元の出力が 1536 次元の gte-Qwen2、vLLM 構成は次元削減を明示した
Qwen3-Embedding-4B を使います。不正な出力を切り詰めたり、ゼロ埋めしたり、次元指定を
外して再試行したり、外部サービスへ自動的に切り替えたりしません。

provider は前後空白を除去して小文字化します。空または `openai` のみ対応し、
削除済みの `ollama` を含む他の値は通信前に設定エラーとなります。model が空なら
`text-embedding-3-small` を使うため、社内のモデル名を明示します。
旧 `OLLAMA_BASE_URL`／`WORKER_OLLAMA_BASE_URL` は削除してください。
同じ次元数でもモデルを変えると既存の埋め込み再生成が必要です。後述の保守・復旧手順に従います。

出典は [OpenAI の埋め込み](../reference/ai-references.md#openai-embeddings)、Qwen3 を使う場合は
[Qwen3 Embedding](../reference/ai-references.md#qwen3-embedding)を参照し、重みの revision、量子化、
配備したイメージを記録してください。

## 何を検証するか

シーン検索・索引作成を行う経路では、DBの宣言型が `vector(1536)` か確認します。空テーブルでも検出し、列欠落・別型・次元未固定の `vector` は拒否します。

生成ベクトルは、1536個の有限な数値からなり、pgvectorのfloat32に収まり、非ゼロである必要があります。文字列や真偽値を数値に変換して受け入れません。バッチ件数とOpenAIの応答indexも入力に対応するか検証します。

シーン分割も共通の出力検証を使いますが、単独の計算にはDB接続を要求しません。契約違反は正常なフォールバックとして隠さず失敗させます。純粋なデータ削除にはモデル呼び出しや認証情報を要求しません。

全体再索引では、対象動画がある場合にDBの埋め込み契約を確認し、**動画1本分の新しい埋め込みをすべて生成・検証してから、その動画の既存行を変更**します。現在の動画行をロックして字幕を再確認し、1つのトランザクションで行を置き換えます。失敗した動画の旧索引は保持し、ほかの動画は処理を続けます。1件でも失敗すれば再試行のためジョブを失敗にします。最初に全索引を削除する処理や、別途短い入力でモデルを試す処理はありません。必要なら下記の `--probe` 診断を明示的に実行します。原子的な置き換えの単位は動画ごとであり、索引全体ではありません。

## APIとworkerの診断結果を比較する

各実行環境で有効なprovider・modelと、そのDBを指す `DATABASE_URL` を設定します。以下はAPI・workerそれぞれのディレクトリで実行します。APIは `DOTENV_CONFIG_PATH` でdotenvファイルを指定できます。Pythonはexport済み環境変数を読みます。

```bash
# apps/api: 設定とDBの宣言型のみ
npm run embeddings:check
# apps/worker: workerをインストールしたPython環境で実行
python -m worker_python.check_embeddings
```

短い診断入力でモデル出力も検証する場合は、明示的に `--probe` を付けます。外部APIの利用料金が発生する場合があります。

```bash
# apps/api
npm run embeddings:check -- --probe
# apps/worker
python -m worker_python.check_embeddings --probe
```

DB検証の成功時は次のようなJSONが出力されます。

```json
{"event":"embedding.validation","provider":"openai","model":"text-embedding-3-small","expected_dimensions":1536,"db_dimensions":1536}
```

出力検証では `actual_dimensions` も出ます。両環境の `provider`・`model`・次元の項目を比較してください。診断ログに認証情報・接続文字列・入力文・ベクトル本体は含めません。起動やヘルスチェックだけで有料Embeddingを生成することはありません。

| 内部理由 | 意味 |
|---|---|
| `EMBEDDING_CONFIG_INVALID` | 未対応provider・必須modelの未指定・workerの埋め込み要求に対するHTTP 4xxの拒否（408/429を除く） |
| `EMBEDDING_SCHEMA_MISMATCH` | DBの宣言型が `vector(1536)` と異なる |
| `EMBEDDING_OUTPUT_INVALID` | モデル出力・件数・indexが不正 |

Q&Aの公開エラーは既存の分類を維持します。設定・スキーマ不整合はHTTP 400の `VALIDATION_ERROR` またはSSEの `LLM_CONFIGURATION_ERROR`、出力不整合はHTTP 500の `INTERNAL_ERROR` またはSSEの `LLM_PROVIDER_ERROR` です。失敗した回答では予約済み利用枠を解放します。workerは既存の失敗・再試行処理に接続します。

workerは、非対応モデル・次元指定などに対する恒久的な拒否をシーン分割の上位へ伝えます。providerのエラー本文はログに出しません。タイムアウト・利用制限・サーバー障害は、シーン分割の既存フォールバックを維持します。

## 既存データと今後のモデル変更

**同じ次元でも、異なるモデルのベクトルは比較可能とは限りません。** 保存データには生成モデルやrevisionの履歴がありません。DB検証だけでAPI・workerのモデル不一致、旧モデルのデータ、同じタグの実体変更を検出することはできません。診断結果を比較し、生成構成は運用記録にも残してください。

既存データのモデル移行ツールは提供していません。1536次元のままモデルを変える場合も、シーンの埋め込みを再生成する必要があります。全体再索引はシーンを更新しますが、途中失敗時の復旧を含めた移行手順が必要です。

今後の移行設計には、次の条件がすべて必要です。

1. 元データを変更せず対象モデル・要求次元を検証し、旧データの生成構成を記録から確認する。
2. 次元を変更する場合はアプリの契約とDrizzleスキーマを更新し、固定次元 `vector(N)` への新しいmigrationを生成する。過去のSQL・snapshotは書き換えず、起動時の自動DDLも追加しない。
3. 保守時間を確保し、Q&A・workerの書き込み・実行中処理・キュー内の旧ジョブを止める。
4. 字幕・ベクトル・スキーマ・アプリ版・設定を復元できるバックアップを確保する。次元の異なる旧ベクトルを `ALTER TYPE` だけで保持できるとは扱わない。
5. 字幕を維持し、シーンのベクトルを同じ構成で再生成する。
6. 件数・欠落・次元・Q&A検索を確認し、API・workerの設定を揃えて再開する。途中失敗時は保守を維持し、旧データ・スキーマ・アプリ・設定を一式で復元する。

データ保持と復旧の仕組みが揃うまで、既存DBのモデル・次元変更は標準の運用手順として提供しません。破棄可能な開発DBの作り直しとは区別してください。
