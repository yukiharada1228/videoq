// Load only from the trusted workflow revision, never the model's checkout.
const policy = require('./dependency-automation.cjs');
const { execFileSync } = require('node:child_process');
const { readFileSync, lstatSync } = require('node:fs');
const { resolve } = require('node:path');
const MARKER = '<!-- videoq-claude-dependency-v1 -->';
const REPO = 'videoq-jp/videoq';
const sha = value => /^[a-f0-9]{40}$/.test(value || '');

function records(comments, kind) {
  return comments.filter(c => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(MARKER + '\n'))
    .flatMap(c => { try { return [JSON.parse(c.body.split('\n')[1])]; } catch { return []; } })
    .filter(r => r.kind === kind);
}
async function record(github, context, number, data, message = '') {
  await github.rest.issues.createComment({ ...context.repo, issue_number: number,
    body: `${MARKER}\n${JSON.stringify(data)}\n\n${message}` });
}
async function seed({ github, context, pr, metadata }) {
  if (!['npm_and_yarn', 'pip', 'uv'].includes(metadata.ecosystem)) return;
  const { comments } = await policy.getPull({ github, context, number: pr.number });
  if (records(comments, 'seed').some(r => r.sha === pr.head.sha)) return;
  await record(github, context, pr.number, { kind: 'seed', sha: pr.head.sha, metadata },
    'Claude自動修正用の依存更新情報を検証しました。修正は機能が有効な場合のCI失敗時のみ実行します。');
}
function sourceFile(path) {
  return /^(?:apps\/(?:api|web|docs|demo-video)\/src\/|packages\/trpc\/src\/|apps\/worker\/worker_python\/|apps\/inference\/whisper\/)[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|py)$/.test(path) &&
    !/(?:^|\/)(?:\.\.?|tests?|__tests__|__mocks__|fixtures|migrations)(?:\/|$)|(?:^|[./_-])(?:test|spec|config|auth|secrets?|credentials|migration|env)(?:[./_-]|$)|\.d\.ts$/.test(path);
}
function validRepairFiles(files) {
  return files.length > 0 && files.length <= 8 &&
    files.every(f => f.status === 'modified' && sourceFile(f.filename) && f.patch &&
      Number.isInteger(f.changes) && f.changes > 0) &&
    files.reduce((sum, f) => sum + f.changes, 0) <= 300;
}
function chain(commits, comments, aliases = {}) {
  for (const origin of records(comments, 'seed').reverse()) {
    const index = commits.findIndex(c => c.sha === origin.sha);
    if (index < 0 || !policy.verifiedDependencyCommits(commits.slice(0, index + 1), origin.sha)) continue;
    const repairs = commits.slice(index + 1);
    if (repairs.length > 2) continue;
    let parent = origin.sha;
    const accepted = [];
    for (const commit of repairs) {
      const receipt = records(comments, 'published').find(r => r.sha === commit.sha && (aliases[r.parent] || r.parent) === parent &&
        r.origin === origin.sha && /^\d+$/.test(String(r.runId)));
      if (!receipt || commit.parents?.length !== 1 || (aliases[commit.parents[0].sha] || commit.parents[0].sha) !== parent) break;
      accepted.push(receipt); parent = commit.sha;
    }
    if (accepted.length === repairs.length) return { origin, repairs: accepted };
  }
  return null;
}
async function candidate({ github, context, runId }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== REPO || context.ref !== 'refs/heads/main' || !/^\d+$/.test(String(runId))) throw new Error('Invalid repair invocation');
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: runId });
  const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'ci.yml' });
  if (run.workflow_id !== workflow.id || run.event !== 'pull_request' || run.status !== 'completed' ||
    !['success', 'failure'].includes(run.conclusion) || run.repository?.full_name !== REPO || run.head_repository?.full_name !== REPO) return null;
  const { data: pulls } = await github.rest.pulls.list({ ...context.repo, state: 'open', head: `${context.repo.owner}:${run.head_branch}`, base: 'main' });
  if (pulls.length !== 1) return null;
  const { pr, files, comments } = await policy.getPull({ github, context, number: pulls[0].number });
  if (pr.head.sha !== run.head_sha || !sha(pr.head.sha) || pr.state !== 'open' || pr.draft ||
    pr.user?.login !== 'dependabot[bot]' || pr.head.repo?.full_name !== REPO || pr.base.repo?.full_name !== REPO ||
    pr.base.ref !== 'main' || !pr.head.ref.startsWith('dependabot/') ||
    pr.labels.some(l => ['no-automerge', 'no-claude', 'no-codex'].includes(l.name)) || comments.some(policy.isRepairRequest)) return null;
  const { data: runs } = await github.rest.actions.listWorkflowRuns({ ...context.repo, workflow_id: workflow.id, head_sha: run.head_sha, event: 'pull_request', per_page: 100 });
  const latest = runs.workflow_runs.sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.id !== run.id || latest.run_attempt !== run.run_attempt) return null;
  const commits = await github.paginate(github.rest.pulls.listCommits, { ...context.repo, pull_number: pr.number, per_page: 100 });
  if (commits.at(-1)?.sha !== pr.head.sha) return null;
  const expanded = await require('./dependency-rebase.cjs').expandHistory({ github, context, pr, files, comments, commits });
  const history = chain(expanded.commits, comments, expanded.aliases);
  if (!history || !['npm_and_yarn', 'pip', 'uv'].includes(history.origin.metadata?.ecosystem)) return null;
  // Verify the seed against the original dependency-only diff, even after source repairs.
  const { data: original } = await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${pr.base.sha}...${history.origin.sha}` });
  if (!policy.autoMergeMetadata(history.origin.metadata, original.files || [])) return null;
  for (const repair of history.repairs) {
    const { data: diff } = await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${repair.parent}...${repair.sha}` });
    if (diff.total_commits !== 1 || !validRepairFiles(diff.files || [])) return null;
  }
  // Reject files outside the union of the verified original and repair diffs.
  if (files.length > 66) return null;
  return { pr, comments, run, ...history };
}
async function scope(args) {
  const c = await candidate(args);
  if (!c || c.run.conclusion !== 'failure') return null;
  const { github, context } = args;
  if (c.pr.auto_merge) {
    if (!args.writerGithub) throw new Error('A write-capable GitHub App client is required to cancel auto-merge');
    await args.writerGithub.graphql('mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { clientMutationId } }', { id: c.pr.node_id });
  }
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...context.repo, run_id: c.run.id, filter: 'latest', per_page: 100 });
  if (['Supply Chain Security', 'Deployment Security Tests'].some(name => !jobs.some(j => j.name === name && j.conclusion === 'success'))) {
    if (!records(c.comments, 'security-stop').some(r => r.sha === c.pr.head.sha)) await record(github, context, c.pr.number,
      { kind: 'security-stop', sha: c.pr.head.sha }, 'セキュリティ検査が成功していないためClaude自動修正を停止しました。人による確認が必要です。');
    return null;
  }
  const attempts = records(c.comments, 'attempt');
  if (attempts.some(r => r.sha === c.pr.head.sha)) return null;
  if (attempts.length >= 2) {
    if (!records(c.comments, 'stopped').length) await record(github, context, c.pr.number, { kind: 'stopped' },
      'Claude自動修正の再試行上限に達しました。人による確認が必要です。');
    return null;
  }
  const attempt = { kind: 'attempt', sha: c.pr.head.sha, origin: c.origin.sha, runId: String(context.runId), failedRun: c.run.id };
  await record(github, context, c.pr.number, attempt, 'CI失敗を受け、Claudeによる互換性修正を開始します（最大2回）。');
  return { number: c.pr.number, sha: c.pr.head.sha, branch: c.pr.head.ref, origin: c.origin.sha };
}
function git(cwd, ...args) { return execFileSync('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }); }
async function authorizedAttempt({ github, context, c, authorizationRun }) {
  if (!/^\d+$/.test(String(authorizationRun)) || !records(c.comments, 'attempt')
    .some(r => r.sha === c.pr.head.sha && r.runId === String(authorizationRun))) return false;
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: authorizationRun });
  const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'dependency-queue.yml' });
  return run.workflow_id === workflow.id && run.repository?.full_name === REPO && run.head_repository?.full_name === REPO &&
    run.head_branch === 'main' && ['push', 'workflow_run', 'workflow_dispatch'].includes(run.event);
}
async function claimWorker(args) {
  const c = await candidate(args);
  if (!c || c.run.conclusion !== 'failure' || c.pr.head.sha !== args.expectedSha ||
    String(c.pr.number) !== String(args.number) || !await authorizedAttempt({ ...args, c }) ||
    records(c.comments, 'worker-start').some(r => r.authorizationRun === String(args.authorizationRun))) throw new Error('Repair already claimed or unauthorized');
  await record(args.github, args.context, c.pr.number, { kind: 'worker-start', sha: c.pr.head.sha,
    authorizationRun: String(args.authorizationRun), runId: String(args.context.runId) }, '読み取り専用のClaude修正ジョブを開始します。');
}
function applyPatch(cwd, patchPath) {
  if (lstatSync(patchPath).size > 200000) throw new Error('Patch too large');
  git(cwd, 'apply', '--check', '--', patchPath);
  git(cwd, 'apply', '--index', '--', patchPath);
  const entries = git(cwd, 'diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames').split('\0');
  const files = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const match = entries[i].match(/^:100644 100644 [a-f0-9]{40} [a-f0-9]{40} M$/);
    const path = entries[i + 1];
    if (!match || !sourceFile(path) || !lstatSync(resolve(cwd, path)).isFile()) throw new Error('Forbidden repair path or mode');
    files.push(path);
  }
  const stats = git(cwd, 'diff', '--cached', '--numstat', '--no-renames').trim().split('\n');
  if (!files.length || files.length > 8 || stats.some(s => !/^\d+\t\d+\t/.test(s)) ||
    stats.reduce((n, s) => n + Number(s.split('\t')[0]) + Number(s.split('\t')[1]), 0) > 300) throw new Error('Repair exceeds limits');
  return files;
}
async function publish(args) {
  const { writerGithub: github, context, expectedSha, cwd, patchPath } = args;
  const c = await candidate(args);
  if (!c || c.run.conclusion !== 'failure' || c.pr.head.sha !== expectedSha ||
    !await authorizedAttempt({ ...args, c }) || !records(c.comments, 'worker-start').some(r =>
      r.sha === expectedSha && r.authorizationRun === String(args.authorizationRun) && r.runId === String(context.runId))) throw new Error('Stale or unapproved repair');
  const files = applyPatch(cwd, patchPath);
  const tree = [];
  for (const path of files) {
    const { data: blob } = await github.rest.git.createBlob({ ...context.repo, content: readFileSync(resolve(cwd, path)).toString('base64'), encoding: 'base64' });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const { data: parent } = await github.rest.git.getCommit({ ...context.repo, commit_sha: expectedSha });
  const { data: newTree } = await github.rest.git.createTree({ ...context.repo, base_tree: parent.tree.sha, tree });
  const { data: commit } = await github.rest.git.createCommit({ ...context.repo, message: `fix: compatibility after dependency update (#${c.pr.number})`, tree: newTree.sha, parents: [expectedSha] });
  // Write the receipt before push: the synchronize workflow can immediately verify the new SHA.
  await record(args.github, context, c.pr.number, { kind: 'published', sha: commit.sha, parent: expectedSha, origin: c.origin.sha, runId: String(context.runId) },
    `Claudeの修正を反映します: ${commit.sha}。通常のCIが成功するまでマージしません。`);
  const { data: current } = await github.rest.pulls.get({ ...context.repo, pull_number: c.pr.number });
  if (current.head.sha !== expectedSha || current.labels.some(l => ['no-automerge', 'no-claude', 'no-codex'].includes(l.name))) throw new Error('PR changed during repair');
  await github.rest.git.updateRef({ ...context.repo, ref: `heads/${c.pr.head.ref}`, sha: commit.sha, force: false });
}
module.exports = { records, seed, sourceFile, validRepairFiles, chain, candidate, scope, authorizedAttempt, claimWorker, applyPatch, publish };
