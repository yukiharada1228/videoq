const REPOSITORIES = new Set([
  'videoq-jp/videoq',
  'yukiharada1228/langchainjs-postgres',
  'yukiharada1228/shadcn-digital-agency-jp',
]);
const KINDS = new Set([
  'dependency-stalls', 'dependency-security', 'container-security',
  'production-smoke', 'backup-restore', 'terraform-drift',
]);

function requireMain(context) {
  const repository = context.repo.owner + '/' + context.repo.repo;
  if (!REPOSITORIES.has(repository) || context.ref !== 'refs/heads/main' ||
      !['schedule', 'workflow_dispatch', 'workflow_run'].includes(context.eventName)) {
    throw new Error('Operations notifications require an authorized repository main branch.');
  }
  return repository;
}

function validateReport(report) {
  if (!report || !['ok', 'findings', 'error'].includes(report.status) ||
      typeof report.summary !== 'string' || !report.summary.trim() ||
      !Array.isArray(report.details) || report.details.some(item => typeof item !== 'string')) {
    throw new Error('A complete operations report is required.');
  }
}

async function notify({ github, context, core, kind, title, report }) {
  const repository = requireMain(context);
  if (!KINDS.has(kind) || typeof title !== 'string' || !title.trim()) throw new Error('Unknown operations report.');
  validateReport(report);
  if (!/^\d+$/.test(String(context.runId))) throw new Error('A workflow run ID is required.');
  const marker = '<!-- operations:' + kind + ' -->';
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo, state: 'all', creator: 'github-actions[bot]', per_page: 100,
  });
  const managed = issues.find(issue => !issue.pull_request &&
    issue.user?.login === 'github-actions[bot]' && (issue.body || '').startsWith(marker));
  if (managed?.labels?.some(label => (typeof label === 'string' ? label : label.name) === 'operations-muted')) {
    await core.summary.addRaw('Operations notification is explicitly muted for ' + kind + '.').write();
    return { muted: true };
  }
  const runUrl = 'https://github.com/' + repository + '/actions/runs/' + context.runId;
  await core.summary.addRaw(report.summary + '\n\n' + report.details.slice(0, 100).join('\n')).write();
  if (report.status === 'ok') {
    if (managed?.state === 'open') {
      await github.rest.issues.update({ ...context.repo, issue_number: managed.number, state: 'closed', state_reason: 'completed' });
    }
    return { healthy: true };
  }
  const body = [
    marker, '状態: ' + report.status, report.summary,
    report.details.slice(0, 100).join('\n'), '[最新の実行結果](' + runUrl + ')',
    'このIssueは同じ監視項目で更新され、正常化すると自動で閉じます。',
    '通知を止める場合は operations-muted ラベルを付けてください。',
  ].filter(Boolean).join('\n\n').slice(0, 60_000);
  if (!managed) {
    const { data } = await github.rest.issues.create({
      ...context.repo, title: '[運用] ' + title, body, assignees: [context.repo.owner],
    });
    return { issue: data.number, created: true };
  }
  if (managed.body !== body || managed.state !== 'open') {
    await github.rest.issues.update({
      ...context.repo, issue_number: managed.number, title: '[運用] ' + title, body, state: 'open',
    });
  }
  return { issue: managed.number, created: false };
}

module.exports = { notify, requireMain, validateReport };
