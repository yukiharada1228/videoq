const { Buffer: NodeBuffer } = require('node:buffer');

const FILES = new Set([
  '.github/runtime-versions.json', '.node-version', '.nvmrc', '.python-version',
  'package.json',
  'apps/api/Dockerfile', 'apps/api/Dockerfile.local', 'apps/web/Dockerfile', 'apps/web/Dockerfile.dev',
  'apps/worker/Dockerfile', 'apps/worker/Dockerfile.local', 'apps/worker/Dockerfile.onprem',
]);
const MARKER = '<!-- videoq-runtime-update-v1 -->';
const sha = value => /^[a-f0-9]{40}$/.test(value || '');
function sameLine(plan) {
  if (!/^\d+\.\d+\.\d+$/.test(plan.previous_version || '') || !/^\d+\.\d+\.\d+$/.test(plan.version || '')) return false;
  const before = plan.previous_version.split('.').map(Number), after = plan.version.split('.').map(Number);
  const width = plan.runtime === 'python' || (plan.runtime === 'uv' && before[0] === 0) ? 2 : 1;
  const comparison = after[0] - before[0] || after[1] - before[1] || after[2] - before[2];
  return comparison >= 0 && before.slice(0, width).join('.') === after.slice(0, width).join('.');
}
function receipts(comments, bot) {
  return comments.filter(c => c.user?.login === bot && c.body?.startsWith(MARKER + '\n'))
    .flatMap(c => { try { return [JSON.parse(c.body.split('\n')[1])]; } catch { return []; } });
}
function eligible(pr, files, comments, bot) {
  if (pr.state !== 'open' || pr.draft || pr.user?.login !== bot || pr.base?.ref !== 'main' ||
      pr.base.repo?.full_name !== 'yukiharada1228/videoq' || pr.head.repo?.full_name !== 'yukiharada1228/videoq' ||
      pr.labels.some(l => ['no-automerge', 'no-runtime-update'].includes(l.name)) || !sha(pr.head.sha) ||
      !files.length || files.length > FILES.size || files.some(f => f.status !== 'modified' || !FILES.has(f.filename))) return false;
  return receipts(comments, bot).some(r => r.sha === pr.head.sha && sha(r.base) &&
    r.channel === 'current' && ['node', 'python', 'npm', 'pip', 'uv'].includes(r.runtime) &&
    pr.head.ref === `runtime/${r.runtime}-current` && sameLine(r));
}

async function scope({ github, context, runtime = 'all', channel = 'current' }) {
  if (context.ref !== 'refs/heads/main' || context.repo.owner !== 'yukiharada1228' || context.repo.repo !== 'videoq') throw new Error('Runtime discovery requires canonical main');
  const names = ['node', 'python', 'npm', 'pip', 'uv'];
  if (!['all', ...names].includes(runtime) || !['both', 'current', 'next'].includes(channel)) throw new Error('Invalid runtime selection');
  let include = [];
  if (['schedule', 'workflow_dispatch'].includes(context.eventName)) {
    const channels = context.eventName === 'schedule' || channel === 'both' ? ['current', 'next'] : [channel];
    include = names.filter(n => runtime === 'all' || runtime === n).flatMap(runtime => channels.map(channel => ({ runtime, channel })));
  } else if (['push', 'workflow_run'].includes(context.eventName)) {
    const pulls = await github.paginate(github.rest.pulls.list, { ...context.repo, base: 'main', state: 'open', per_page: 100 });
    for (const pr of pulls) {
      const match = pr.head?.ref?.match(/^runtime\/(node|python|npm|pip|uv)-current$/);
      if (!match || pr.user?.type !== 'Bot' || pr.head.repo?.full_name !== 'yukiharada1228/videoq' || pr.draft ||
        pr.labels.some(l => l.name === 'no-runtime-update')) continue;
      const { data: diff } = await github.rest.repos.compareCommits({ ...context.repo, base: pr.head.sha, head: context.sha });
      if (diff.ahead_by > 0) include.push({ runtime: match[1], channel: 'current' });
    }
    include = [...new Map(include.map(row => [row.runtime, row])).values()];
  } else throw new Error('Unsupported runtime discovery event');
  return { active: include.length > 0, matrix: { include: include.length ? include : [{ runtime: 'node', channel: 'current' }] } };
}

function validate(plan) {
  if (!plan || !['node', 'python', 'npm', 'pip', 'uv'].includes(plan.runtime) ||
      !['current', 'next'].includes(plan.channel) ||
      !/^\d+\.\d+\.\d+$/.test(plan.version) ||
      !plan.files || typeof plan.files !== 'object' || Array.isArray(plan.files) ||
      Object.entries(plan.files).some(([name, content]) => !FILES.has(name) ||
        typeof content !== 'string' || NodeBuffer.byteLength(content) > 200_000) ||
      plan.changed !== (Object.keys(plan.files).length > 0) ||
      (plan.channel === 'current' && plan.previous_version !== undefined && !sameLine(plan))) {
    throw new Error('Invalid interpreter update plan');
  }
}

async function publish({ github, context, core, plan, bot, autoMergeCurrent = false, queue }) {
  validate(plan);
  if (context.ref !== 'refs/heads/main' || !['schedule', 'workflow_dispatch', 'push', 'workflow_run'].includes(context.eventName) ||
      !['videoq', 'shadcn-digital-agency-jp', 'langchainjs-postgres'].includes(context.repo.repo) ||
      context.repo.owner !== 'yukiharada1228' || !/^[a-zA-Z0-9-]+\[bot\]$/.test(bot)) {
    throw new Error('Interpreter updates require the trusted repository main branch and an App token');
  }
  const { data: base } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (base.object.sha !== context.sha) throw new Error('Main changed; rerun discovery against the current commit');
  const branch = `runtime/${plan.runtime}-${plan.channel}`;
  const { data: pulls } = await github.rest.pulls.list({ ...context.repo, state: 'open', base: 'main', head: `${context.repo.owner}:${branch}` });
  if (pulls.length > 1) throw new Error('Ambiguous interpreter update PR');
  const existing = pulls[0];
  if (!plan.changed && !existing) return;
  async function finish(pr, head) {
    if (plan.channel === 'current' && context.repo.repo === 'videoq') {
      if (pr.labels?.some(l => ['no-automerge', 'no-runtime-update'].includes(l.name)) || !autoMergeCurrent) {
        if (pr.auto_merge) await github.graphql('mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}', { id: pr.node_id });
      } else {
        if (!sameLine(plan) || typeof queue !== 'function') throw new Error('Automatic runtime merges require a verified current-line plan');
        await queue({ number: pr.number, sha: head });
      }
    }
    return pr.number;
  }
  let managed = existing;
  let old;
  try {
    old = (await github.rest.git.getRef({ ...context.repo, ref: `heads/${branch}` })).data.object.sha;
  } catch (error) { if (error.status !== 404) throw error; }
  if (old) {
    if (!managed) {
      const { data: closed } = await github.rest.pulls.list({ ...context.repo, state: 'closed', base: 'main', head: `${context.repo.owner}:${branch}` });
      managed = closed.find(pr => pr.merged_at && pr.user.login === bot && pr.head.sha === old);
    }
    if (!managed || managed.user.login !== bot || managed.head.sha !== old) {
      throw new Error('Refusing to overwrite an unmanaged runtime branch');
    }
    const commits = await github.paginate(github.rest.pulls.listCommits, { ...context.repo, pull_number: managed.number, per_page: 100 });
    if (!commits.length || commits.some(commit => commit.author?.login !== bot)) {
      throw new Error('Runtime PR has human changes; preserve them for review');
    }
    const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: managed.number, per_page: 100 });
    if (!receipts(comments, bot).some(r => r.sha === old && r.runtime === plan.runtime && r.channel === plan.channel)) {
      throw new Error('Runtime head has no trusted publication receipt; preserve it for review');
    }
    if (existing?.labels?.some(l => l.name === 'no-runtime-update')) return finish(existing, old);
    if (!plan.changed) {
      // The official discovery result is already in main; retire only a managed,
      // unedited current-line proposal superseded by that canonical state.
      if (existing && plan.channel === 'current' && autoMergeCurrent && !existing.labels?.some(l => ['no-automerge', 'no-runtime-update'].includes(l.name))) {
        await github.rest.pulls.update({ ...context.repo, pull_number: existing.number, state: 'closed' });
        core.info(`Closed superseded runtime PR #${existing.number}`);
      }
      return;
    }
    // Avoid adding identical commits on every scheduled run.
    const { data: diff } = await github.rest.repos.compareCommits({ ...context.repo, base: old, head: base.object.sha });
    const same = await Promise.all(Object.entries(plan.files).map(async ([path, content]) => {
      try {
        const { data } = await github.rest.repos.getContent({ ...context.repo, path, ref: old });
        return NodeBuffer.from(data.content, 'base64').toString('utf8') === content;
      } catch (error) { if (error.status === 404) return false; throw error; }
    }));
    if (existing && diff.ahead_by === 0 && same.every(Boolean)) return finish(existing, old);
  }
  const tree = [];
  for (const [path, content] of Object.entries(plan.files)) {
    const { data } = await github.rest.git.createBlob({ ...context.repo, content, encoding: 'utf-8' });
    tree.push({ path, mode: '100644', type: 'blob', sha: data.sha });
  }
  const { data: baseCommit } = await github.rest.git.getCommit({ ...context.repo, commit_sha: base.object.sha });
  const { data: nextTree } = await github.rest.git.createTree({ ...context.repo, base_tree: baseCommit.tree.sha, tree });
  const name = { node: 'Node.js', python: 'Python', npm: 'npm', pip: 'pip', uv: 'uv' }[plan.runtime];
  const title = `chore(runtime): update ${name} to ${plan.version}`;
  const { data: commit } = await github.rest.git.createCommit({ ...context.repo, message: title, tree: nextTree.sha,
    parents: old && old !== base.object.sha ? [base.object.sha, old] : [base.object.sha] });
  if (old) {
    const current = (await github.rest.git.getRef({ ...context.repo, ref: `heads/${branch}` })).data.object.sha;
    if (current !== old) throw new Error('Runtime branch changed while preparing the update');
    await github.rest.git.updateRef({ ...context.repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
  } else {
    await github.rest.git.createRef({ ...context.repo, ref: `refs/heads/${branch}`, sha: commit.sha });
  }
  const body = [
    'Interpreter pins, CI version files, and applicable container images are updated together from the canonical runtime manifest.',
    plan.channel === 'next' ? 'This proposes a new interpreter release line. Missing wheels, provider support, or compatibility failures must be resolved before merging. Current-line security updates have a separate PR.' : 'This tracks the current interpreter release line, including security fixes and rebuilt base-image digests.',
    plan.channel === 'current' ? 'Normal CI and strict branch protection must pass before automatic merging. The canonical manifest and generated pins stay together.' : 'New release lines require human review; this workflow does not enable automatic merging for them.',
  ].join('\n\n');
  const result = existing
    ? await github.rest.pulls.update({ ...context.repo, pull_number: existing.number, title, body })
    : await github.rest.pulls.create({ ...context.repo, head: branch, base: 'main', title, body });
  await github.rest.issues.createComment({ ...context.repo, issue_number: result.data.number,
    body: `${MARKER}\n${JSON.stringify({ sha: commit.sha, base: base.object.sha, runtime: plan.runtime,
      channel: plan.channel, version: plan.version, previous_version: plan.previous_version })}\n\n管理表と生成ファイルをまとめて更新しました。既存系列のみ、必須CI成功後の自動マージ対象です。` });
  core.info(`Prepared interpreter update PR #${result.data.number}`);
  return finish(result.data, commit.sha);
}

module.exports = { validate, publish, FILES, sameLine, receipts, eligible, scope };
