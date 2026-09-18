---
title: 担当別に見る処理の流れ
description: 利用者・API・workerがどのタイミングで何を担当するか。
---

# 担当別に見る処理の流れ

このページは、処理の担当がどこで切り替わるかを確認するための役割別フローです。厳密なBPMN記法ではなく、Mermaidで読みやすく表しています。

## 動画から回答まで

```mermaid
flowchart TB
    subgraph User[利用者とブラウザ]
      Upload[動画を送信] --> Confirm[送信完了を通知]
      Ask[講座について質問] --> Read[回答と引用元を見る]
    end
    subgraph API[Hono API]
      Accept[権限・状態を確認]
      Dispatch[ジョブを配送]
      Answer[許可された情報で回答を生成]
    end
    subgraph Worker[Python worker]
      Transcribe[文字起こし]
      Index[検索用データを保存]
      Plog[PLOGを生成]
    end
    Confirm --> Accept --> Dispatch
    Dispatch --> Transcribe --> Index --> Plog
    Index -. 検索に利用 .-> Answer
    Ask --> Answer --> Read
```

質問への応答はAPIが担当します。workerが処理完了後にブラウザへ直接回答を返す構成ではありません。学習モードには索引に加えてPLOGが必要です。

## 問題が起きたときの担当

| 問題 | 最初に確認する場所 | 次に見る資料 |
|---|---|---|
| ファイルを送れない | ブラウザ、ストレージ、API | [困ったとき](../guides/troubleshooting.md) |
| 動画が処理されない | ジョブ配送、キュー、worker | [ジョブの配送と回復](flowchart.md) |
| 内容と関係のない回答になる | 検索範囲、字幕、プロンプト | [プロンプト設計](prompt-engineering.md) |
| Studyだけ使えない | PLOGの生成状態と順序 | [PLOGと学習モード](../plog/README.md) |

**関連:** 時間順に呼び出しを追うなら[シーケンス図](../design/sequence-diagram.md)、画面操作から追うなら[アクティビティ](../requirements/activity-diagram.md)へ進みます。
