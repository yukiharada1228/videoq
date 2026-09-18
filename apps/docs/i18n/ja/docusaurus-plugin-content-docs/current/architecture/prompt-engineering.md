---
title: Q&Aと学習モードのプロンプト設計
description: 回答に使う情報の選択、引用、学習モード、変更後の評価。
---

# Q&Aと学習モードのプロンプト設計

プロンプトは、AIへ渡す指示と参照情報です。VideoQでは、利用者の質問だけでなく、アクセスできる講座の情報や字幕を使って回答します。

## Q&Aで情報を選ぶ

Q&Aは、必要に応じてツールで情報を取得し、回答を組み立てます。すべての質問で同じ検索を実行するわけではありません。

| 質問の例 | 主に使う情報 |
|---|---|
| 「この講座には動画が何本ある？」 | 登録された講座・動画の情報 |
| 「この授業の内容を要約して」 | 字幕の関連シーン |
| 「この動画の説明文を見せて」 | 登録済みの説明文 |

使えるツールは次の2つです。

- `get_course_info`: 講座名・説明・動画一覧など。1ページ最大20動画、1回答最大5回。
- `search_scenes`: 字幕を意味で検索。講座全体または指定した講座内動画を対象にし、1回答最大3回。

ツールを使うモデルターンには最大8回の上限があり、その後はツールを外して最終回答を生成します。モデルが返した要求をそのまま実行せず、API側でも引数とアクセス範囲を検証します。

## 引用と権限

内容の回答には、検索した字幕から引用番号と時刻を付けます。講座名や動画本数などの登録情報には、シーンの引用番号や時刻を付けません。

検索対象は先にアクセスが確認された講座の範囲です。字幕に命令文が含まれていても参照資料として扱い、システムの指示より優先させません。

## 学習モード

学習モードは[PLOG](../plog/README.md)の概念・前提関係・問い・ヒントを使います。扱う概念や未理解の前提を選び、学習者の答えを評価して進行状態を更新します。

最初の問いは保存済みの文面を使います。その後の支援や評価はLLMを利用し、一時状態は `STUDY_SESSION` に保存します。

## 変更する場所

| 場所 | 役割 |
|---|---|
| [prompts/](https://github.com/yukiharada1228/videoq/tree/main/apps/api/src/lib/prompts) | 指示文と設定 |
| [rag.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag.ts) | Q&Aのツール呼び出し・回答生成 |
| [rag-course-info.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/rag-course-info.ts) | 講座・動画の登録情報 |
| [plog-study.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/plog-study.ts) | 学習モードの回答と評価 |
| [plog_build.py](https://github.com/yukiharada1228/videoq/blob/main/apps/worker/worker_python/pipeline/plog_build.py) | 学習用の概念・問い・ヒントの生成 |

## 変更後に見ること

日本語・英語で、登録情報だけの質問、授業内容の質問、両方が必要な質問を試します。回答だけでなく、使ったツール、引用先、講座外の情報が混ざらないことを確認します。

`LLM_MODEL` は回答や生成に使うモデル、`EMBEDDING_MODEL` は検索用のモデルです。埋め込みは1536次元固定で、API・workerのモデルも揃えます。モデル変更には既存ベクトルの再生成が必要です。[設定と制約](../guides/embeddings.md)を参照してください。

実モデルのテスト方法と料金が発生する条件は[テストと確認コマンド](../guides/testing.md)を参照してください。
