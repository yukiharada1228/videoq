---
sidebar_label: ローカル AI 推論
description: LLM・埋め込み生成・Whisper をオンプレのネットワーク内で動かす。
---

# AI 処理もオンプレで完結させる

Web・API・ワーカーに加えて、LLM・埋め込み生成・Whisper も社内に配置できます。
導入時はコンテナイメージとモデルをダウンロードし、運用中の動画・音声・AI リクエストは
社内のサービスで処理します。アプリ用 Helm Chart の標準設定は外部 OpenAI API のため、
ローカル用の設定を明示的に適用します。

| 構成 | LLM・埋め込み生成 | アプリ側の設定 |
|---|---|---|
| CPU | llama.cpp。回答用・埋め込み用を別サービスに配置 | `local-ai-llamacpp.yaml` |
| NVIDIA GPU | vLLM。回答用・埋め込み用を別サービスに配置 | `local-ai-vllm.yaml` |

文字起こしは、どの構成でも独立した社内の faster-whisper サービスで処理します。
`EMBEDDING_PROVIDER=openai` は API の形式を表します。外部 OpenAI を使う指定ではなく、
`EMBEDDING_BASE_URL` で社内の埋め込み API を指定できます。LLM の `OPENAI_BASE_URL` とは
独立して設定します。認証も分ける場合は Secret に `EMBEDDING_API_KEY` を設定します。

具体的なコマンドは、[推論用 Chart の導入手順](https://github.com/yukiharada1228/videoq/blob/main/charts/videoq-inference/README.md)
にあります。Whisper の社内向けイメージ作成、CPU・NVIDIA GPU の設定、モデルの永続化、
導入後のダウンロード停止、通信制限、実モデルの確認手順をまとめています。
アプリ側は `charts/videoq/examples/` の対応する設定を重ね、更新時も同じ設定を維持します。

CPU の基本構成では、テキスト専用モデルを使うため映像の視覚解析を無効にします。
文字起こし・字幕検索・引用付き回答・タイムスタンプ再生は利用できます。
視覚解析も社内で使うには、画像入力・ツール呼び出し・JSON Schema 出力に対応した
ローカルモデルを別途検証します。vLLM の設定例は、LLM と埋め込み用に 1 GPU ずつ、合計 2 GPU を
要求し、Whisper は CPU で動かします。`whisper-nvidia.yaml` を重ねると、
Whisper 用に追加の 1 GPU を割り当てます。vLLM の GPU 実行・ドライバー互換性は実機での検証が必要です。
日本語の認識・回答品質と処理能力も導入先で確認します。

ローカル Whisper のイメージは導入先でビルドします。既存の署名付き GHCR 配布の 3 イメージには
現時点では含まれていません。外部 OpenAI の API キーは不要で、SDK 向けの仮の値として
`OPENAI_API_KEY=local-inference` を設定します。その他の Secret は
[アプリの導入手順](on-premises.md)に従います。

導入後は、社外への通信を止めた状態で、アップロード → 文字起こし → インデックス登録 →
引用付きストリーミング回答 → タイムスタンプ再生を確認します。通信制限には NetworkPolicy を
実際に適用する CNI が必要です。埋め込みのモデル・量子化・pooling・前処理を切り替えると、同じ 1536 次元でも既存動画の
埋め込み再生成が必要です。llama.cpp の CPU 構成は元の出力が 1536 次元の gte-Qwen2、
vLLM は Qwen3-Embedding-4B の Matryoshka 出力を 1536 次元に指定します。
オンプレ版では外部メール・Google ログイン・Stripe・YouTube/SearchAPI を無効にし、
管理者がローカルアカウントと初期設定リンクを発行します。
