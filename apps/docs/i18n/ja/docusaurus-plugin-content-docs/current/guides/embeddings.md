---
title: 埋め込みの設定と検証
description: 1536次元固定の仕様、providerの設定、診断方法、モデル変更時の制約。
---

# 埋め込みの設定と検証

VideoQはシーンの埋め込みを `scene_embeddings.embedding vector(1536)` に保存します。API・Python workerの次元数は定数 `EMBEDDING_DIMENSIONS = 1536` で固定です。`EMBEDDING_VECTOR_SIZE` は廃止しました。環境に残っていても値によらず参照しません。この変更にDB migrationは不要です。

## 新規環境のproviderを選ぶ

設定テンプレート・Compose・Wranglerの標準値は次のとおりです。

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

各環境に `OPENAI_API_KEY` を設定します。質問・字幕のどちらも `dimensions: 1536` を送信します。別のモデルを使う場合も、このパラメーターを受け付けて1536次元を生成できる必要があります。指定を外して再試行する処理はありません。

providerは前後空白を除去して小文字化し、空ならOpenAIを選びます。OpenAIでmodelが空なら `text-embedding-3-small` を使います。modelは前後空白を除去しますが大小文字は保持します。不明なproviderやOllamaのmodel未指定は設定エラーです。

Wranglerは開発・本番とも `EMBEDDING_MODEL` を空にし、この既定値をアダプターで解決します。providerだけをOllamaに変更してもOpenAIのモデル名が補完されず、モデル未指定として検証で拒否されます。

**破棄可能な新しい開発DB**ではOllamaも選べます。

```bash
ollama pull qwen3-embedding:4b
```

```dotenv
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:4b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Docker ComposeからホストのOllamaを使う場合は、`OLLAMA_BASE_URL` と `WORKER_OLLAMA_BASE_URL` の両方を `http://host.docker.internal:11434` にします。API・workerのproviderとmodelを揃えてください。Ollamaが置き換えるのは埋め込み生成です。文字起こしや回答生成の設定は独立しており、OpenAIの認証情報が必要な場合があります。

両アダプターは `POST /api/embed` に `model`・`input`・`dimensions: 1536` を渡し、`embeddings` 配列を読み取ります。モデルが対応する次元削減をAPIへ要求する方式です。アプリによる切り詰め・ゼロ埋めや旧 `/api/embeddings` へのフォールバックは行いません。

`qwen3-embedding:4b` は元の次元数が2560で、次元削減に対応します。1024次元の `qwen3-embedding:0.6b` は対象外です。4096次元の `8b` は候補ですが別途検証が必要です。[Qwenのモデル表](https://github.com/QwenLM/Qwen3-Embedding#qwen3-embedding-series-model-list)と[OllamaのAPI仕様](https://docs.ollama.com/api/embed)を参照してください。4b構成はOllama 0.34.2で確認しました。サーバーやモデルの更新時は実際の出力も診断してください。

## 何を検証するか

シーン検索・索引作成を行う経路では、DBの宣言型が `vector(1536)` か確認します。空テーブルでも検出し、列欠落・別型・次元未固定の `vector` は拒否します。

生成ベクトルは、1536個の有限な数値からなり、pgvectorのfloat32に収まり、非ゼロである必要があります。文字列や真偽値を数値に変換して受け入れません。バッチ件数とOpenAIの応答indexも入力に対応するか検証します。

シーン分割・RAGASも共通の出力検証を使いますが、単独の計算にはDB接続を要求しません。契約違反は正常なフォールバックや評価値の欠損として隠さず失敗させます。純粋なデータ削除にはモデル呼び出しや認証情報を要求しません。全体再索引は、**既存ベクトルを削除する前に**設定・DB・短い実ベクトルを検証します。ただし後続バッチの途中失敗を原子的に復旧する仕組みではありません。

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

workerは、非対応モデル・次元指定などに対する恒久的な拒否をシーン分割・RAGASの上位へ伝え、評価も失敗として記録します。providerのエラー本文はログに出しません。タイムアウト・利用制限・サーバー障害は、この2経路の既存フォールバックを維持します。

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
