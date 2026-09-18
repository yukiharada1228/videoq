---
title: 利用者の操作とシステムの動き
description: 動画登録と質問の操作が、裏側の処理にどうつながるか。
---

# 利用者の操作とシステムの動き

画面での操作と、システム内部で起こる処理を対応させます。実装を読む前に、利用者がどこで待ち、何を見て次へ進むかを確認するための図です。

## 動画を質問に使えるようにする

```mermaid
flowchart TD
    Select[利用者が動画を選ぶ] --> Validate[APIがサイズ・利用上限を確認]
    Validate --> Upload[ブラウザがストレージへ送る]
    Upload --> Confirm[送信完了をAPIに通知]
    Confirm --> Queue[APIが処理を依頼]
    Queue --> Transcribe[workerが文字起こし]
    Transcribe --> Index[workerが検索用データを作成]
    Index --> Ready[画面で処理完了を確認]
    Ready --> Course[講座に動画を追加して質問]
```

ファイル送信後も、文字起こしと検索準備が終わるまでは待ち時間があります。エラーが起きたときに、送信失敗と処理失敗を同じ表示にしないことが重要です。

## 質問に答える

```mermaid
flowchart TD
    Ask[質問を入力] --> Access[APIが講座へのアクセスを確認]
    Access --> Agent[回答処理が必要な情報を選ぶ]
    Agent --> Meta[講座名・動画一覧などを取得]
    Agent --> Search[字幕の関連シーンを検索]
    Meta --> Answer[回答を作成]
    Search --> Answer
    Answer --> Display[画面に回答を順次表示]
    Display --> Citation[引用元があれば場面へ移動]
```

登録情報だけで答えられる質問もあります。授業内容に関する質問では字幕を参照します。具体的なツールと制限は[プロンプト設計](../architecture/prompt-engineering.md)にまとめています。

## 学習モードとの違い

学習モードでは、自由な質問への回答に加えて、PLOGの概念・前提関係・問い・ヒントを使います。動画の処理完了と学習用グラフの準備完了は別です。

**関連:** [動画の状態](../design/state-diagram.md)、[PLOGと学習モード](../plog/README.md)、[担当別のフロー](../architecture/bpmn.md)。
