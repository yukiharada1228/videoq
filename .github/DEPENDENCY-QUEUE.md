# GitHub Merge Queue

mainへのマージ順と統合用CIはGitHub標準のMerge Queueで管理する。
通常の開発PRもmainへマージする際はこのキューを使う。
Dependency Automationが自動投入するのは、検証済みのDependabot major/minor/patch更新と
管理Botの`runtime/*-current` PR。ランタイムの新系列・除外PRは人が判断する。
自動処理の対象外でも、人がキューへ投入したPRをコントローラーが取り消すことはない。
自動更新Bot自身が投入した予約だけを、由来の検証失敗や除外指定に応じて取り消す。

通常のPR CIが成功すると、コントローラーが現在のhead SHAを指定してキューへ投入する。
GitHubは最新mainと対象PRを統合したコミットを作り、`merge_group`のCIを実行する。
統合用ビルドは同時1件、マージグループは1 PRとし、先行PRのマージで後続の投機ビルドが
無効になるのを防ぐ。通常のmain更新では待機中PRのブランチを再生成・rebaseしない。

必須チェックはGitHub Actionsの`CI Success`、`Supply Chain Security`、
`Terraform Plan`、`Container Validation`。管理者にも適用する。
「ブランチを最新に保つ」は無効にし、代わりにMerge Queueを必須にする。
設定は[.github/native-merge-queue.json](native-merge-queue.json)を参照する。
キューの待機上限は120分で、90分上限のオンプレミス検証も待てるようにしている。

## CI失敗・競合とClaude修正

キュー上での失敗は、実際のworkflow ID、リポジトリ、現在のPR headの祖先関係、
Botの更新由来を確認する。必要な場合だけそのPRを最新mainへ追従し、通常PR CIで再現する。
この再現はPR全体で最大2回。合成されたキュー用コミットを直接Claudeへ渡さない。
通常のPR CIが修正対象として検証できた場合に、既存のClaude判定へ進む。
競合があるDependabot PRも、署名済みの元更新と現在のmainを検証してClaudeへ渡す。
設定・生成型・テストを含めて互換性を直し、通常CIと同じキューへ戻す。
CI修正・競合解消はそれぞれ最大8回、同じheadも実行完了後に再試行可能。実行中は重複起動しない。
セキュリティ検査の失敗、未検証の変更、修正上限は引き続き人による確認が必要。

状態用Issue、実行枠確認ジョブ、独自の必須チェックは使用しない。
PRイベント、main push、CIとClaudeワーカーの完了イベントで動き、main追従の定期確認は行わない。
ランタイムの日次探索は、新しい公式リリースを見つけるために継続する。

## 運用

- `DEPENDENCY_AUTOMERGE_ENABLED=true`で自動更新コントローラーを有効にする。
- `RUNTIME_AUTOMERGE_ENABLED=false`はランタイムPRの自動投入を停止する。
- `CLAUDE_DEPENDENCY_REPAIR_ENABLED=true`は、対応するCI失敗の修正を許可する。
- `no-automerge`、`no-runtime-update`、`no-rebase`、`no-claude`などの除外は
  [依存更新の自動化](dependency-automation.md)を参照する。

自動投入を止める場合は`DEPENDENCY_AUTOMERGE_ENABLED=false`にする。
mainのMerge Queueルールと必須チェックは維持し、通常の開発PRは引き続きキューでマージする。
既に投入されたPRはキュー画面から個別に除外する。保護設定を外して直接マージしない。
