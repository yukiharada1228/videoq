const { requireMain } = require('./operations-notify.cjs');
const HOUR = 3_600_000;

async function inspect({ github, context, now = new Date(), minimumHours = 48 }) {
  const repository = requireMain(context);
  if (!Number.isFinite(minimumHours) || minimumHours < 1 || minimumHours > 720 ||
      !Number.isFinite(now.getTime())) throw new Error('Invalid staleness threshold.');
  const pulls = await github.paginate(github.rest.pulls.list, {
    ...context.repo, state: 'open', base: 'main', per_page: 100,
  });
  const details = [];
  for (const item of pulls) {
    if (item.user?.login !== 'dependabot[bot]' || item.draft ||
        item.head?.repo?.full_name !== repository ||
        item.labels.some(label => label.name === 'operations-muted')) continue;
    const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: item.number });
    if (pr.state !== 'open' || pr.draft || pr.head.sha !== item.head.sha) continue;
    const { data: commit } = await github.rest.repos.getCommit({ ...context.repo, ref: pr.head.sha });
    const updated = Date.parse(commit.commit?.committer?.date || pr.created_at);
    if (!Number.isFinite(updated)) throw new Error('Cannot determine the dependency PR age.');
    const hours = Math.floor((now.getTime() - updated) / HOUR);
    if (hours < minimumHours) continue;
    const { data: runs } = await github.rest.actions.listWorkflowRuns({
      ...context.repo, workflow_id: 'ci.yml', event: 'pull_request', head_sha: pr.head.sha, per_page: 100,
    });
    const latest = runs.workflow_runs.sort((a, b) => b.id - a.id)[0];
    let reason;
    if (pr.mergeable_state === 'dirty') reason = '競合の解消待ち';
    else if (pr.mergeable_state === 'behind') reason = '最新mainへの追従待ち';
    else if (latest?.conclusion === 'failure') reason = 'CI修正待ち';
    else if (!latest) reason = '対象コミットのCIが未実行';
    else if (latest.status !== 'completed') reason = 'CIが長時間未完了';
    else if (latest.conclusion !== 'success') reason = 'CIの再確認待ち';
    else if (!pr.auto_merge) reason = '手動確認・マージ待ち';
    else reason = '自動マージが長時間待機中';
    details.push('- [#' + pr.number + '](https://github.com/' + repository + '/pull/' +
      pr.number + '): ' + reason + '（最終コミットから' + hours + '時間）');
  }
  details.sort();
  return {
    status: details.length ? 'findings' : 'ok',
    summary: details.length ? '依存関係の更新PRが' + details.length + '件滞留しています。' : '滞留している依存関係更新PRはありません。',
    details,
  };
}

module.exports = { inspect };
