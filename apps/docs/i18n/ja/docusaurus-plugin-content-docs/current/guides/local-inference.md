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

Kubernetes の文字起こしは、どの構成でも独立した社内の faster-whisper サービスで処理します。
Mac での開発・手元実行には、Metal を使えるネイティブの whisper.cpp を使います。
どちらも `WHISPER_BACKEND=local` とし、接続先を `WHISPER_LOCAL_URL` で指定します。
API の形式は OpenAI 互換に統一し、`EMBEDDING_BASE_URL` で社内の埋め込み API を指定します。LLM の `OPENAI_BASE_URL` とは
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

## Mac で whisper.cpp を使う

Apple Silicon の Metal を使うため、whisper.cpp は macOS 上で直接起動します。
Kubernetes の共通サービスは CPU または NVIDIA GPU の faster-whisper を使います。
whisper.cpp 自体は Mac 以外でも動きますが、VideoQ ではこの配置を基本にします。

Mac に CMake・C++ のビルド環境・FFmpeg を用意し、VideoQ のルートで実行します。

```sh
git submodule update --init --recursive
cd whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j --config Release
bash ./models/download-ggml-model.sh large-v3-turbo
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin \
  --host 127.0.0.1 --port 8080 --inference-path /audio/transcriptions \
  --convert -l auto
```

同梱のサブモジュールでサーバーのバージョンを固定しています。モデルは導入時に取得し、
起動後はローカルのファイルを読み込みます。ワーカーは MP3 を送るため、Mac 側の
FFmpeg で変換する `--convert` が必要です。タイムスタンプは有効にしたまま使います。
ワーカーが `verbose_json` とセグメント単位の時刻を要求します。日本語に固定する場合は
`-l auto` を `-l ja` に変更します。リクエストのモデル名 `whisper-local` は共通の呼び出し名で、
whisper.cpp が実際に使う重みは `-m` で指定したファイルです。

ワーカーには、文字起こしのパスを含めず、API のベース URL を設定します。

| 文字起こしサービス | `WHISPER_BACKEND` | `WHISPER_LOCAL_URL` |
|---|---|---|
| Mac の whisper.cpp、ワーカーも Mac 上で直接実行 | `local` | `http://127.0.0.1:8080` |
| Mac の whisper.cpp、ワーカーは Docker Desktop | `local` | `http://host.docker.internal:8080` |
| Kubernetes の faster-whisper | `local` | `http://videoq-inference-whisper:8080/v1` |

SDK がベース URL に `/audio/transcriptions` を付けます。上記の whisper.cpp は
`/audio/transcriptions`、faster-whisper は `/v1/audio/transcriptions` で受け付けます。
Compose の `.env` を変更した後は、ワーカーを再作成します。

```sh
docker compose up -d --force-recreate worker
```

whisper.cpp の開発用サーバーには認証がないため、待ち受け先はループバックのまま使います。
実音声での確認には、15 秒以上の発話を含む機密情報のないローカル動画と、
ワーカーの開発環境を使います。VideoQ のルートから次を実行します。

```sh
cd apps/worker
LOCAL_AI_TEST_WHISPER_BASE_URL=http://127.0.0.1:8080 \
LOCAL_AI_TEST_WHISPER_VIDEO=/absolute/path/to/speech.mp4 \
  .venv/bin/python -m pytest tests/test_local_whisper_integration.py -v
```

この明示実行のテストは、本番のワーカー処理で MP3 を抽出し、指定したサービスを呼び出します。
API が実際に返したセグメント時刻、元動画への時刻補正、字幕生成を確認します。
ストレージへのアップロードや DB 書き込みは行いません。faster-whisper も `/v1` を含む
ベース URL で同じテストを使えます。通常の CI ではスキップし、音声モデルは取得しません。
オプションの詳細は [whisper.cpp のサーバー説明](https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/examples/server/README.md)を参照してください。
