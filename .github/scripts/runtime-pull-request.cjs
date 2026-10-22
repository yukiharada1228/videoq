const { Buffer: NodeBuffer } = require('node:buffer');

const FILES = new Set([
  '.github/runtime-versions.json', '.node-version', '.nvmrc', '.python-version',
  'package.json',
  'apps/api/Dockerfile.local', 'apps/web/Dockerfile', 'apps/web/Dockerfile.dev',
  'apps/worker/Dockerfile', 'apps/worker/Dockerfile.local', 'apps/worker/Dockerfile.modal',
]);

function validate(plan) {
  if (!plan || !['node', 'python', 'npm', 'pip', 'uv'].includes(plan.runtime) ||
      !['current', 'next'].includes(plan.channel) ||
      !/^\d+\.\d+\.\d+$/.test(plan.version) ||
      !plan.files || typeof plan.files !== 'object' || Array.isArray(plan.files) ||
      Object.entries(plan.files).some(([name, content]) => !FILES.has(name) ||
        typeof content !== 'string' || NodeBuffer.byteLength(content) > 200_000) ||
      plan.changed !== (Object.keys(plan.files).length > 0)) {
    throw new Error('Invalid interpreter update plan');
  }
}

async function publish({ github, context, core, plan, bot }) {
  validate(plan);
  if (context.ref !== 'refs/heads/main' || !['schedule', 'workflow_dispatch'].includes(context.eventName) ||
      !['videoq', 'shadcn-digital-agency-jp', 'langchainjs-postgres'].includes(context.repo.repo) ||
      context.repo.owner !== 'yukiharada1228' || !/^[a-zA-Z0-9-]+\[bot\]$/.test(bot)) {
    throw new Error('Interpreter updates require the trusted repository main branch and an App token');
  }
  if (!plan.changed) return;
  const { data: base } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (base.object.sha !== context.sha) throw new Error('Main changed; rerun discovery against the current commit');
  const branch = `runtime/${plan.runtime}-${plan.channel}`;
  const { data: pulls } = await github.rest.pulls.list({ ...context.repo, state: 'open', base: 'main', head: `${context.repo.owner}:${branch}` });
  if (pulls.length > 1) throw new Error('Ambiguous interpreter update PR');
  const existing = pulls[0];
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
    // Avoid adding identical commits on every scheduled run.
    const { data: diff } = await github.rest.repos.compareCommits({ ...context.repo, base: old, head: base.object.sha });
    const same = await Promise.all(Object.entries(plan.files).map(async ([path, content]) => {
      try {
        const { data } = await github.rest.repos.getContent({ ...context.repo, path, ref: old });
        return NodeBuffer.from(data.content, 'base64').toString('utf8') === content;
      } catch (error) { if (error.status === 404) return false; throw error; }
    }));
    if (existing && diff.ahead_by === 0 && same.every(Boolean)) return;
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
    'The normal CI must test the proposed runtime. Runtime PRs require human review and never enable auto-merge.',
  ].join('\n\n');
  const result = existing
    ? await github.rest.pulls.update({ ...context.repo, pull_number: existing.number, title, body })
    : await github.rest.pulls.create({ ...context.repo, head: branch, base: 'main', title, body });
  core.info(`Prepared interpreter update PR #${result.data.number}`);
  return result.data.number;
}

module.exports = { validate, publish, FILES };
