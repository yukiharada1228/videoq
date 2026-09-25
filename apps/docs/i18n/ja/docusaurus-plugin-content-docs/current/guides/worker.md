---
title: 動画の非同期処理を変更する
description: ジョブの入口、処理本体、再試行の考え方とローカルでの確認方法。
---

# 動画の非同期処理を変更する

文字起こしや索引作成は時間がかかるため、APIの応答を待たせずにPython workerで実行します。APIは「この動画を処理してほしい」というジョブをキューへ送り、workerが受け取ります。

## 処理の入口

| 変更したいこと | 主な場所 |
|---|---|
| ジョブの種類・データ形式 | `apps/worker/worker_python/contracts.py` |
| ジョブ名と処理関数の対応 | `worker_python/tasks/registry.py` |
| 状態更新・次のジョブへの受け渡し | `worker_python/tasks/` |
| 文字起こし・検索用データ・PLOGの処理本体 | `worker_python/pipeline/` |
| 重複実行の制御 | `worker_python/job_execution.py` |
| AWS Lambdaの入口 | `worker_python/lambda_handler.py` |

ファイルの実体はすべて `apps/worker/` 配下にあります。API側のメッセージ形式は [job-message.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/job-message.ts)も確認します。

## メッセージの形

```json
{
  "type": "transcribe_video",
  "job_id": "ジョブを識別するUUID",
  "payload": {"video_id": 123}
}
```

上記は形式の例です。通常はAPIの操作でジョブを作り、手でキューへ投入する必要はありません。

処理は概ね `transcribe_video` → `index_video_transcript` → `build_plog` の順です。検索可能な状態とPLOGの準備完了は分けて確認します。[動画の状態](../design/state-diagram.md)を参照してください。

## 再試行を前提にする

SQSは同じメッセージを複数回届ける可能性があります。workerは `job_id` の実行記録と期限付きの実行権を使い、完了した処理の重複を避けます。後続ジョブのIDも親ジョブから決定します。

処理を追加するときは「途中で失敗して再実行されても、データや後続ジョブが重複しないか」を確認します。これを冪等性と呼びます。例外を握り潰すと再試行されず、状態だけが途中で残ることがあります。

## ローカルで追う

Pythonのコードを編集したら、起動中のworkerを再起動して読み直します。依存パッケージを変更した場合はイメージの再ビルドも必要です。

```bash
docker compose restart worker
```

```bash
docker compose logs --tail=100 worker
docker compose logs -f worker
```

画面から短い動画を登録し、対象の動画IDでログを追います。`Ctrl+C` でログ表示を止めてもworkerは動き続けます。文字起こし・埋め込み・PLOG生成を実行すると、設定した外部APIが呼ばれます。

Pythonのテスト環境とコマンドは[テストの使い分け](testing.md)を参照してください。接続先やモデル設定は [worker README](https://github.com/yukiharada1228/videoq/blob/main/apps/worker/README.md)にあります。

**関連:** [ジョブの配送と回復](../architecture/flowchart.md)、[PLOGと学習モード](../plog/README.md)。
