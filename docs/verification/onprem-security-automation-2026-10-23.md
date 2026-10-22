# オンプレの更新・サプライチェーン対策レビュー（2026-10-23）

この文書はベースイメージ変更前のレビュー記録です。以後の修正と結果は
[追加検証](onprem-hardening-2026-10-23.md)を参照してください。以下の検出件数と未実施事項は、この時点の状態を記録したものです。

結論は「既存サービスの依存更新は自動化済み、オンプレの本番反映と任意のコード修正は追加の運用が必要」です。
今回の修正は作業ツリーにあり、GitHub と本番への反映は未実施です。

## 実際に確認した設定と履歴

GitHub API と、作業ツリーの基点 `d6a38c56`、取得した main `d8537cc8` を照合しました。取得中の main の進行は既存の作業ツリーへマージしていません。

| 要求 | 確認結果 | 根拠・制約 |
| --- | --- | --- |
| 依存更新の検知・PR | 有効 | npm、uv、Docker、Actions、Terraform 等の Dependabot 設定。GitHub の security updates も enabled |
| 検査後の修正適用 | 条件付きで自動 | `DEPENDENCY_AUTOMERGE_ENABLED=true`、App ID と秘密鍵の登録、auto-merge/squash 有効を確認。minor/patch、署名済み Bot コミット、変更範囲、maintainer変更の有無を検査 |
| マージ前の必須検査 | 有効 | main は strict、管理者にも適用。GitHub Actions の `CI Success`、`Supply Chain Security`、`Terraform Plan`、`Container Validation` が必須 |
| レビューの自動実行 | 一部確認 | CodeQL と CI は実行履歴あり。人の承認の必須数は0。Codex の個人アカウント側の自動レビュー設定は未確認 |
| CI失敗時の修正 | 本人の操作が必要 | 修正依頼案内を出すワークフロー。案内だけでは修正コードを生成しない。本人の依頼後は手動レビュー・マージ |
| 既知の脆弱性・不正な配布物 | 検査あり | Dependency Review、OSV、registry制限、lock整合性、npm署名検証、Action SHA固定、ライフサイクルスクリプト制限、資格情報を分離したビルド |
| 公開直後の修正 | 所要時間の保証なし | 通常の npm/uv は7日 cooldown。セキュリティ更新は対象外。修正版と脆弱性情報の公開、PR作成、CI成功が前提 |
| 全依存の継続監視 | 有効・指摘あり | 全ロックの週次 OSV 検査が指摘を通知し、[Issue #1124](https://github.com/yukiharada1228/videoq/issues/1124) を維持。今回の日次化は反映待ち |
| 本番コンテナの継続監視 | Lambda向け | 稼働中の ECR digest を日次検査。導入先 Kubernetes の実イメージは監視対象に含まれない |
| 更新後の本番反映 | 既存クラウド向け | main の検証後に既存 CD。オンプレ向けの公開レジストリ・GitOps・クラスタ接続は未設定 |
| オンプレの回復・スケール | 基本動作まで | Deploymentの再起動・ヘルスチェック、SIGTERM時の終了待ち、DB状態を使う定期回収。HPA/KEDA、ノードやGPUの自動拡縮は未実装 |
| バックアップ・復元 | 導入先の設定が必要 | 既存の論理DB復元ワークフローはクラウド向け。導入先DB/S3/キューのバックアップ・復元試験は別途必要 |
| 実行環境の更新 | main に仕組みあり | `Runtime Updates` は active。ただし確認時の実行履歴は0件。新規オンプレ Dockerfile は対象表から漏れており、下記の統合パッチを作成 |

確認できた履歴：

- [自動マージの実行成功](https://github.com/yukiharada1228/videoq/actions/runs/39805770949)
- [CodeQL の実行成功](https://github.com/yukiharada1228/videoq/actions/runs/39806883857)
- [全依存監視の指摘](https://github.com/yukiharada1228/videoq/actions/runs/39786461726)
- [本番 Lambda イメージ検査の成功](https://github.com/yukiharada1228/videoq/actions/runs/39786456804)

## 適用した修正

1. 独立していたオンプレ検証を再利用可能なワークフローにし、既存の必須 `CI Success` に接続しました。対象変更なのに失敗・中止・skipした場合は成功扱いにしません。Webのソースや実行環境の更新も検証対象です。
2. API・ワーカー・Webの最終イメージを Trivy 0.76.1 で検査し、HIGH/CRITICAL は修正版未提供でも失敗にします。CycloneDX SBOM を30日間保持します。ビルドには本番資格情報・書き込み権限を渡しません。
3. Helm に各イメージの `digest` と `requireImageDigests` を追加しました。有効化すると不足時に描画が失敗します。API の Deployment・マイグレーション・定期処理・接続テストは同じ digest を使います。初期値はローカルビルド用にタグを許可し、本番用の site 設定例では有効にしています。設定例のゼロdigestは実際の値へ置き換えます。
4. Node/Python と Web の nginx を公式レジストリの digest に固定しました。Node/Python は取得した main のバージョンに合わせ、レジストリ応答から digest と amd64/arm64 の提供を確認しました。
5. APIの実行イメージから npm と不要な optional peer/buildツール、ワーカーから uv/pip を除外しました。Pythonはハッシュ付きwheelだけをpipなしの仮想環境へインストールします。Webビルドにも `--ignore-scripts` を付けました。
6. 新規オンプレ Dockerfile を依存更新の判定と Dockerfile 検証に追加しました。
7. npm audit で追加検出した [ip-address の DoS](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) を、互換範囲内の 10.7.3 → 10.7.4 に更新しました。
8. 全依存の検査を週次から日次へ変更しました。通常の更新PRを7日待機させる設定は維持し、公開済みの脆弱性を継続的に再検査します。
9. 全体の npm audit で DOMPurify の追加指摘3件（CRITICALを含む）も確認し、3.4.16 → 3.4.17 に更新しました。既存の開発依存に対する全体検査と、変更差分の検査の両方が必要であることを実データでも確認しています。

## 実イメージ検査の結果と導入条件

ARM64 のイメージを実際にビルドし、Trivyの最新取得DBで HIGH/CRITICAL と未修正版を含めて検査しました。検出件数は同じ advisory が複数パッケージに付く分も数えています。実際の到達可能性や攻撃成立を個別に実証した件数ではありません。

| イメージ | 修正前の検出数 | 修正後の検出数 | 修正後の一意の識別子数 |
| --- | ---: | ---: | ---: |
| API | 135 | 57 | 12 |
| ワーカー | 279 | 275 | 74 |
| Web | 0 | 0 | 0 |

検査した最終イメージの識別子、終了コード、SBOM構成部品数は[検証記録](onprem-security-images-2026-10-23.json)に保存しています。これらはローカルビルドの識別子で、公開レジストリで配布しているイメージではありません。

修正後の残存指摘には Trivy が示す修正版がありません。主に Debian と ffmpeg のパッケージです。API・ワーカーのセキュリティ検査は失敗し、新しい必須CIは更新を止める状態です。検査の免除や `ignore-unfixed=true` は追加していません。修正版のあるベースへの移行と機能検証、または根拠・期限付きの個別リスク審査が本番導入前に必要です。

ワーカーの修正前レポートには実行環境に存在しない Python パッケージも含まれていました。実際の配布一覧を調べ、ビルド用ツールに含まれるメタデータを切り分けています。最終環境の `urllib3` は既に2.8.0で、不要なツールを持ち込まない形に整理しました。

全体の npm 開発依存には引き続き [braces の未修正問題](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) が残ります。既存の通知を維持し、解消済みとは扱いません。

## 変更後の検証

- 自動化のポリシーテスト：Node 152件、Python 14件成功。
- Node実行・共有PostgreSQL状態・S3・Helmの検証：25件成功。API型検査と Helm lint も成功。
- Actionlint：変更したCI・オンプレ・コンテナ・日次依存検査のYAMLを検証。
- `npm ci --ignore-scripts` が成功。APIイメージのインストール時auditは0件。全体のnpm auditはCRITICALが0件となり、残るHIGH表示は上記bracesと影響を受ける親依存です。
- registry・lock整合性と、新規5バージョンに対するOSV照会が成功。
- API・Web・ワーカーのARM64イメージをビルド。最終イメージとTrivyレポートの識別子が一致することを確認し、3個のCycloneDX SBOMも生成・検証。
- 最終APIイメージでHTTP、認証、両チャットの未認証拒否、同時認証、定期処理CLI、SIGTERM終了のスモークが成功。ワーカーのimportとffmpegによる16kHz/mono音声抽出も成功。
- DOMPurify更新後の英語・日本語ドキュメントのビルドと公開内容検査が成功。

今回追加したワークフローのGitHub上での実行と、修正版イメージでのKubernetesライフサイクル試験は未実施です。既存のクラスタ試験は[前回の動作検証](onprem-helm-2026-10-23.md)を参照してください。Trivyの指摘は上記のとおり残っており、セキュリティ検査全体を合格とは扱いません。

## 最新 main への統合

当初はランタイム更新への追補パッチを別途準備していました。その後、`d8537cc8` を基点とした
`codex/onprem-production-hardening` にオンプレの変更を統合し、Runtime Updates 本体へ反映しました。
手動で追補パッチを適用する必要はありません。最新の生成・更新テストと実イメージの結果は
[追加検証](onprem-hardening-2026-10-23.md)に記録します。

## 攻撃が疑われる場合の運用

1. 対象PRに `no-automerge` を付け、全体を止める場合は `DEPENDENCY_AUTOMERGE_ENABLED=false` にします。予約済みの auto-merge は別途解除します。
2. 対象の公開バージョン、コミット、実際の稼働digestを特定し、SBOMから影響範囲を確認します。正規署名があっても内容が安全とは限りません。
3. 配布を止め、DB互換性を確認して既知の安全なdigestへ戻します。漏洩の可能性があれば、該当環境の資格情報を失効・更新します。
4. 修正版を資格情報のない環境でビルド・検査し、設定変更をレビューして段階的に配備します。

現状、イメージの署名付き公開・クラスタでの署名強制、オンプレ稼働イメージの定期再検査、OS/Kubernetesのパッチ、導入先DB/S3/キューの復元検証は導入先の運用として残ります。未知の悪意ある更新を全て自動検出・修正する保証はありません。

参考： [Dependabot cooldown](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown)、[Kubernetes のイメージdigest](https://kubernetes.io/docs/concepts/containers/images/#image-names)、[成果物の由来検証](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations)。
