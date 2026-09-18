const DAY = 86_400_000;
const PREFIX = '<!-- videoq-token-expiry:';
const BOT = 'github-actions[bot]';

function dateMillis(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected a YYYY-MM-DD date');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date');
  }
  return ms;
}

function validateConfig(config) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(config.assignee ?? '')) {
    throw new Error('A valid GitHub assignee is required');
  }
  if (!Array.isArray(config.credentials) || !config.credentials.length) {
    throw new Error('At least one credential expiry must be configured');
  }
  const ids = new Set();
  for (const entry of config.credentials) {
    if (!/^[a-z0-9-]+$/.test(entry.id ?? '') || ids.has(entry.id)) {
      throw new Error('Credential IDs must be unique');
    }
    ids.add(entry.id);
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.name ?? '')) throw new Error('Invalid token name');
    dateMillis(entry.expiresOn);
    if (!Array.isArray(entry.secrets) || !entry.secrets.length ||
        entry.secrets.some(value => !/^[a-z0-9-]+\.[A-Z0-9_]+$/.test(value))) {
      throw new Error('Environment secret destinations are required');
    }
  }
}

function stageFor(days) {
  if (days <= 0) return 'expired';
  if (days <= 1) return '1-day';
  if (days <= 7) return '7-days';
  if (days <= 14) return '14-days';
  if (days <= 30) return '30-days';
  return null;
}

function details(entries) {
  return entries.map(entry => `- \`${entry.name}\` → ${entry.secrets.map(s => `\`${s}\``).join(', ')}`).join('\n');
}

async function check({ github, context, core, config, now = new Date(), dryRun = false, previewDate = '' }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== 'yukiharada1228/videoq' ||
      context.ref !== 'refs/heads/main' ||
      !['push', 'schedule', 'workflow_dispatch'].includes(context.eventName)) {
    throw new Error('Token reminders may only run on the production repository main branch');
  }
  validateConfig(config);
  if (previewDate && !dryRun) throw new Error('preview_date requires dry_run');
  const today = previewDate || now.toISOString().slice(0, 10);
  const current = dateMillis(today);
  const groups = new Map();
  for (const entry of config.credentials) {
    const group = groups.get(entry.expiresOn) ?? [];
    group.push(entry);
    groups.set(entry.expiresOn, group);
  }

  const repo = context.repo;
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...repo, state: 'all', creator: BOT, per_page: 100,
  });
  const managed = issues.filter(issue => !issue.pull_request && issue.user?.login === BOT &&
    new RegExp(`^${PREFIX}(\\d{4}-\\d{2}-\\d{2}) -->`).test(issue.body ?? ''));
  const report = [`## Cloudflare token expiry${dryRun ? ' (dry run)' : ''}`, '', `UTC date: ${today}`, ''];
  let urgent = false;

  for (const [expiresOn, entries] of groups) {
    const days = (dateMillis(expiresOn) - current) / DAY;
    const stage = stageFor(days);
    const marker = `${PREFIX}${expiresOn} -->`;
    const noticeMarker = `<!-- notified:${stage} -->`;
    report.push(`- ${expiresOn}: ${days} days remaining; ${entries.map(e => e.id).join(', ')}; ${stage ?? 'healthy'}`);
    if (!stage) continue;
    if (days <= 7) urgent = true;
    core.warning(`Cloudflare tokens expire on ${expiresOn} (${days} days remaining)`);
    if (dryRun) continue;

    let issue = managed.find(item => item.body.startsWith(marker));
    const status = days <= 0 ? '有効期限当日または期限切れです' : `有効期限まであと${days}日です`;
    const notice = `@${config.assignee} Cloudflareトークンの${status}。期限: **${expiresOn}**。\n\n${details(entries)}`;
    if (!issue) {
      const body = `${marker}\n${noticeMarker}\n${notice}\n\n` +
        '期限当日に失効時刻を迎える前に、前日までの更新を推奨します。\n\n' +
        '- [ ] 同じ必要最小限の権限で新しいトークンを発行\n' +
        '- [ ] 上記のGitHub Environment secretsをすべて更新\n' +
        '- [ ] deploy／resource同期が成功することを確認し、旧トークンを失効\n' +
        '- [ ] `.github/cloudflare-token-expiry.json` の名前と期限を更新するPRをmainへmerge\n' +
        '- [ ] 予備のカレンダー通知を使っている場合は、その日付も更新\n\n' +
        '手順: [トークン更新と通知](https://github.com/yukiharada1228/videoq/blob/main/infra/CLOUDFLARE_TOKEN_ROTATION.md)\n\n' +
        'トークンの値はIssue・PR・ログへ記載しないでください。' +
        '期限設定が更新されるまで、Issueを閉じても監視が再開します。';
      ({ data: issue } = await github.rest.issues.create({
        ...repo, title: `[要更新] Cloudflareトークンの有効期限 ${expiresOn}`,
        body, assignees: [config.assignee],
      }));
    } else {
      if (issue.state === 'closed') {
        await github.rest.issues.update({ ...repo, issue_number: issue.number, state: 'open' });
      }
      const comments = await github.paginate(github.rest.issues.listComments, {
        ...repo, issue_number: issue.number, per_page: 100,
      });
      const notified = issue.body.includes(noticeMarker) || comments.some(comment =>
        comment.user?.login === BOT && (comment.body ?? '').includes(noticeMarker));
      if (!notified) {
        await github.rest.issues.createComment({
          ...repo, issue_number: issue.number, body: `${noticeMarker}\n${notice}`,
        });
      }
    }
    report.push(`  - ${issue.html_url}`);
  }

  // A verified rotation updates the tracked expiry via a reviewed PR. Closing
  // an issue alone must never silence an outstanding expiry alert.
  for (const issue of managed) {
    const expiresOn = issue.body.slice(PREFIX.length, PREFIX.length + 10);
    if (issue.state === 'open' && !groups.has(expiresOn)) {
      report.push(`- Close superseded reminder #${issue.number} (${expiresOn})`);
      if (!dryRun) {
        await github.rest.issues.update({ ...repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
      }
    }
  }
  await core.summary.addRaw(`${report.join('\n')}\n`).write();
  if (urgent && !dryRun) {
    core.setFailed('Cloudflare token renewal is due within 7 days or overdue. See the assigned issue.');
  }
  return { today, urgent, dryRun };
}

module.exports = check;
module.exports.validateConfig = validateConfig;
module.exports.stageFor = stageFor;
