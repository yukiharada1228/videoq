# 自動更新PRのCIキュー

Dependabotの自動マージ可能なpatch/minor更新と、管理Botが生成した
`runtime/*-current` PRを、作成順に1件ずつ処理する。
通常の開発PR、major更新、`runtime/*-next`、明示的な除外PRは通常CIとレビューを利用する。

選択したPRだけを最新mainへ追従させ、CIとContainer Validationを実行する。
1件のPR内では従来どおり各テストを並列実行する。待機PRは軽量なQueue Admissionだけ実行し、
重いCI・コンテナビルドは保留する。Terraform PlanとCodeQLは従来どおり起動する。
`Dependency Queue`はCIの実ジョブで、実行枠の確認とCIの成功を検証する。
待機中は`Dependency Waiting`、`CI Waiting`、`Supply Chain Waiting`、`Container Waiting`という別名で報告し、
必須チェックをスキップ成功で上書きしない。CI・Container Validation・Terraform Planが実際に成功してから
コントローラーがマージする。Checks APIで独自の必須ゲートは作成しない。

処理はPRイベント、main push、関連ワークフローの開始・完了イベントで進む。定期ポーリングはしない。
CI失敗・安全にmain追従できないPRは、そのhead SHAを修正待ちとしてキューから外し、次のPRを進める。
Claude修正は従来の対象・上限のままで、実際に実行したCIの失敗だけを処理する。
修正コミットが追加されるとキューへ戻る。手動再試行はDependency Automationの`retry`にPR番号を指定する。

状態は`DEPENDENCY_QUEUE_ISSUE`で指定したIssue内のActions Botコメントに保存する。
Issue本文や一般ユーザーのコメントは実行権限として使わない。
順番の情報だけで自動マージを許可せず、毎回署名・変更ファイル・管理Botの公開記録を検証する。
PRコードを実行するジョブに書き込みトークンやApp秘密鍵は渡さない。

## 有効化

1. 先にワークフローをmainへマージする（フラグ未設定時は通常CI）。
2. 状態保存用Issueを作成し、番号を`DEPENDENCY_QUEUE_ISSUE`に設定する。
3. mainの必須チェックへ`Dependency Queue`（GitHub Actions App ID 15368）を追加する。
   既存の必須チェックとstrict設定を維持する。先にチェックを必須化することで移行中もスキップCIでマージされない。
4. `DEPENDENCY_QUEUE_ENABLED=true`にし、Dependency Automationを手動起動する。
5. Issueの実行中・待機状態、選択PRのmain追従、CI完走後のゲート成功を確認する。

旧Dependency Main Sync、個別のDependabot／Runtime Auto-merge、旧Codex案内、独立したClaude判定ワークフローは廃止した。
Runtime Updatesは日次探索と指定された再生成だけを担当する。既存PRのmain追従と最終マージは
コントローラーで選択した1件だけを処理する。CIの実行枠確認は共通の`dependency-ci-admission.yml`へまとめている。

## 運用上の範囲

手動の開発PRがmainへマージされると、実行中の自動更新PRは新しいmainで再検証する必要がある。
このキューは自動更新PR同士の先行マージによるCIのやり直しを減らす。
競合・未対応の生成ファイル・修正上限・外部サービス障害を無条件に解決するものではない。

停止時は`DEPENDENCY_QUEUE_ENABLED=false`とし、必須の`Dependency Queue`チェックも解除する。
待機していたPRは通常CIを再実行する。必須チェックだけを解除してキューを有効のままにしない。
既存の自動マージ・Claude・ランタイム更新のフラグと除外ラベルは引き続き適用する。
