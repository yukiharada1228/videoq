---
sidebar_label: ローカル AI 推論
description: LLM・埋め込み生成・Whisper をオンプレのネットワーク内で動かす。
---

# AI 処理もオンプレで完結させる

Web・API・ワーカーに加えて、LLM・埋め込み生成・Whisper も社内に配置できます。
導入時はコンテナイメージとモデルをダウンロードし、運用中の動画・音声・AI リクエストは
社内のサービスで処理します。アプリ用 Helm Chart の標準設定は外部 OpenAI API のため、
ローカル用の設定を明示的に適用します。

| 処理 | 社内の実行先 | CPU 検証用モデル |
|---|---|---|
| 回答生成・ツール呼び出し | Ollama の OpenAI 互換 API | qwen3:4b |
| 検索・登録用の埋め込み生成 | Ollama /api/embed、1536 次元 | qwen3-embedding:4b |
| アップロード音声の文字起こし | 社内の faster-whisper API | Whisper base |

具体的なコマンドは、[推論用 Chart の導入手順](https://github.com/yukiharada1228/videoq/blob/main/charts/videoq-inference/README.md)
にあります。Whisper の社内向けイメージ作成、CPU・NVIDIA GPU の設定、モデルの永続化、
導入後のダウンロード停止、通信制限、実モデルの確認手順をまとめています。
アプリ側は `charts/videoq/examples/local-ai.yaml` を重ねて適用します。

CPU の基本構成では、テキスト専用モデルを使うため映像の視覚解析を無効にします。
文字起こし・字幕検索・引用付き回答・タイムスタンプ再生は利用できます。
視覚解析も社内で使うには、画像入力・ツール呼び出し・JSON Schema 出力に対応した
ローカルモデルを別途検証します。NVIDIA の設定例は、両サービスに 1 GPU ずつ、合計 2 GPU を
要求します。片方を CPU に戻す調整も可能です。日本語の認識・回答品質と処理能力は導入先で確認します。

ローカル Whisper のイメージは導入先でビルドします。既存の署名付き GHCR 配布の 3 イメージには
現時点では含まれていません。外部 OpenAI の API キーは不要で、SDK 向けの仮の値として
`OPENAI_API_KEY=local-inference` を設定します。その他の Secret は
[アプリの導入手順](on-premises.md)に従います。

導入後は、社外への通信を止めた状態で、アップロード → 文字起こし → インデックス登録 →
引用付きストリーミング回答 → タイムスタンプ再生を確認します。通信制限には NetworkPolicy を
実際に適用する CNI が必要です。埋め込みモデルを切り替えると、既存動画の埋め込み再生成も必要です。
メール・Google OAuth・Stripe・YouTube/SearchAPI の外部連携は別途判断します。
この手順の対象は、アップロード動画とメール・パスワードによるローカル認証です。
