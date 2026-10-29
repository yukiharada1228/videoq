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
  await core.summary.addRaw(report.summary + '\n\n' + report.details.slice(0, 100).join('\n')).write();
  return { healthy: report.status === 'ok' };
}

module.exports = { notify, requireMain, validateReport };
