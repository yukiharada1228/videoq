// Always load this module from github.workflow_sha, never from a PR checkout.
const REPOSITORY = 'yukiharada1228/videoq';
const BOT = 'dependabot[bot]';
const REQUEST_MARKER = '<!-- videoq-codex-repair-request -->';
const manifests = new Set([
  'package.json', 'package-lock.json',
  'apps/api/package.json', 'apps/web/package.json', 'apps/docs/package.json',
  'apps/demo-video/package.json', 'packages/trpc/package.json',
  'apps/worker/pyproject.toml', 'apps/worker/uv.lock',
  'apps/inference/whisper/pyproject.toml', 'apps/inference/whisper/uv.lock',
]);

// Scope each verified ecosystem to its own dependency files.
const ecosystemFiles = {
  npm_and_yarn: [
    'package.json', 'package-lock.json',
    'apps/api/package.json', 'apps/web/package.json', 'apps/docs/package.json',
    'apps/demo-video/package.json', 'packages/trpc/package.json',
  ],
  pip: ['apps/worker/pyproject.toml', 'apps/worker/uv.lock'],
  uv: ['apps/worker/pyproject.toml', 'apps/worker/uv.lock',
    'apps/inference/whisper/pyproject.toml', 'apps/inference/whisper/uv.lock'],
  docker: [
    'apps/api/Dockerfile', 'apps/api/Dockerfile.local', 'apps/web/Dockerfile', 'apps/web/Dockerfile.dev',
    'apps/worker/Dockerfile', 'apps/worker/Dockerfile.local', 'apps/worker/Dockerfile.onprem',
    'apps/inference/whisper/Dockerfile',
  ],
  docker_compose: ['docker-compose.yml'],
  'docker-compose': ['docker-compose.yml'],
  terraform: [
    'infra/versions.tf', 'infra/.terraform.lock.hcl',
    'infra/bootstrap/main.tf', 'infra/bootstrap/.terraform.lock.hcl',
  ],
};
const workflowFile = /^\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/;

function dependencyFile(file, ecosystem) {
  return file.status === 'modified' && (ecosystem === 'github_actions'
    ? workflowFile.test(file.filename)
    : ecosystemFiles[ecosystem]?.includes(file.filename) === true);
}

function actionPinsOnly(files) {
  return files.every(file => {
    if (!file.patch) return false;
    const pins = { '-': [], '+': [] };
    for (const line of file.patch.split('\n')) {
      if (!['-', '+'].includes(line[0])) continue;
      const match = line.slice(1).match(/^(\s*(?:-\s*)?uses:\s*)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+)@[a-f0-9]{40}(?:\s*#.*)?\s*$/);
      if (!match) return false;
      pins[line[0]].push(match[1] + match[2]);
    }
    return pins['-'].length > 0 && JSON.stringify(pins['-']) === JSON.stringify(pins['+']);
  });
}

function terraformVersionsOnly(files) {
  return files.every(file => {
    if (file.filename.endsWith('/.terraform.lock.hcl')) return true;
    if (!file.patch) return false;
    const changed = file.patch.split('\n').filter(line => ['-', '+'].includes(line[0]));
    return changed.length > 0 && changed.every(line => /^\s*version\s*=\s*"[^"\r\n]+"\s*(?:#.*)?$/.test(line.slice(1)));
  });
}

function isRepairRequest(comment) {
  return comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(REQUEST_MARKER);
}

function eligiblePull(pr, files, optOut, comments = [], state = 'open') {
  const merge = optOut === 'no-automerge';
  return pr.state === state && !pr.draft &&
    pr.user?.login === BOT && pr.head?.repo?.full_name === REPOSITORY &&
    pr.base?.repo?.full_name === REPOSITORY && pr.base.ref === 'main' &&
    pr.head.ref.startsWith('dependabot/') && /^[a-f0-9]{40}$/.test(pr.head.sha) &&
    !pr.labels.some(label => label.name === optOut) &&
    (!merge || !comments.some(isRepairRequest)) &&
    files.length > 0 && files.length <= (merge ? 50 : 10) &&
    files.every(file => merge
      ? ['github_actions', ...Object.keys(ecosystemFiles)].some(ecosystem => dependencyFile(file, ecosystem))
      : file.status === 'modified' && manifests.has(file.filename));
}

function autoMergeMetadata(metadata, files) {
  return ['version-update:semver-patch', 'version-update:semver-minor'].includes(metadata.updateType) &&
    metadata.maintainerChanges === 'false' &&
    files.length > 0 && files.length <= 50 &&
    files.every(file => dependencyFile(file, metadata.ecosystem)) &&
    (metadata.ecosystem !== 'github_actions' || actionPinsOnly(files)) &&
    (metadata.ecosystem !== 'terraform' || terraformVersionsOnly(files));
}

function verifiedDependencyCommits(commits, sha) {
  return commits.length > 0 && commits.at(-1).sha === sha &&
    commits.every(commit => commit.author?.login === BOT && commit.commit?.verification?.verified === true);
}

async function getPull({ github, context, number }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== REPOSITORY) throw new Error('Unexpected repository.');
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: number, per_page: 100 });
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: number, per_page: 100 });
  return { pr, files, comments };
}
function requireProtection(protection, ecosystem) {
  const checks = protection.required_status_checks;
  const required = ['CI Success', 'Supply Chain Security'];
  if (ecosystem === 'terraform') required.push('Terraform Plan');
  if (['docker', 'docker_compose', 'docker-compose'].includes(ecosystem)) required.push('Container Validation');
  if (!checks?.strict || required.some(name => !checks.checks?.some(check => check.context === name && check.app_id === 15368))) {
    throw new Error('Auto-merge requires strict branch protection with GitHub Actions CI Success and Supply Chain Security.');
  }
}

async function repairCandidate({ github, context, runId }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== REPOSITORY || context.ref !== 'refs/heads/main') {
    throw new Error('Run this workflow from the source repository main branch.');
  }
  if (!/^\d+$/.test(String(runId))) throw new Error('A numeric CI run ID is required.');
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: runId });
  const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'ci.yml' });
  if (run.workflow_id !== workflow.id || run.event !== 'pull_request' ||
      run.status !== 'completed' || run.conclusion !== 'failure' ||
      run.repository?.full_name !== REPOSITORY || run.head_repository?.full_name !== REPOSITORY) return null;

  // workflow_run.pull_requests can be empty; resolve the open branch PR through the API.
  const { data: pulls } = await github.rest.pulls.list({
    ...context.repo, state: 'open', head: `${context.repo.owner}:${run.head_branch}`, base: 'main',
  });
  if (pulls.length !== 1) return null;
  const { pr, files } = await getPull({ github, context, number: pulls[0].number });
  if (!eligiblePull(pr, files, 'no-codex') || pr.head.sha !== run.head_sha) return null;
  const { data: runs } = await github.rest.actions.listWorkflowRuns({
    ...context.repo, workflow_id: workflow.id, head_sha: run.head_sha, event: 'pull_request', per_page: 100,
  });
  const latest = runs.workflow_runs.sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.id !== run.id || latest.run_attempt !== run.run_attempt) return null;
  return { number: pr.number, sha: pr.head.sha, runId: run.id, attempt: run.run_attempt };
}

function repairRequestBody(candidate) {
  const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`;
  return [
    REQUEST_MARKER,
    '### Codexへの修正依頼（ChatGPTサブスク）',
    `依存関係更新の[CIが失敗しました](${runUrl})。対象コミット: \`${candidate.sha}\`。`,
    '修正を始めるには、CodexとGitHubを連携したご本人がこのPRのコメント欄で `@` に続けて `codex` と入力し、次の依頼文を付けて投稿してください。',
    '```text',
    `fix the CI failures in ${runUrl} for commit ${candidate.sha}.`,
    'Read .github/codex/repair-dependencies.md. Preserve the dependency update and security fixes, reproduce the failure, make the smallest fix, and rerun the affected tests. Report any checks you could not run. Do not merge the PR.',
    '```',
    'この通知だけではCodexは実行されません。修正はChatGPTログインのCodexクラウドで動き、PCの常時起動とOpenAI APIキーは不要です。契約プランの利用枠・GitHubアクセス権が必要です。',
    'このPRは修正内容を人が確認するため、自動マージ対象から外しました。CI成功後に手動でマージしてください。',
    '[GitHub連携の設定](https://chatgpt.com/settings/code-review) · [公式の修正依頼方法](https://developers.openai.com/codex/integrations/github)',
  ].join('\n\n');
}

async function requestRepair({ github, context, runId }) {
  const candidate = await repairCandidate({ github, context, runId });
  if (!candidate) return null;
  const { pr, files, comments } = await getPull({ github, context, number: candidate.number });
  if (pr.head.sha !== candidate.sha || !eligiblePull(pr, files, 'no-codex')) return null;
  // Stop a queued dependency-only merge before the owner asks Codex to change code.
  if (pr.auto_merge) {
    await github.graphql('mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { clientMutationId } }', { id: pr.node_id });
  }
  const body = repairRequestBody(candidate);
  const existing = comments.find(isRepairRequest);
  if (existing?.body === body) return candidate;
  if (existing) {
    await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
  } else {
    await github.rest.issues.createComment({ ...context.repo, issue_number: candidate.number, body });
  }
  return candidate;
}

module.exports = { verifiedDependencyCommits, eligiblePull, getPull, autoMergeMetadata, requireProtection, repairCandidate, isRepairRequest, repairRequestBody, requestRepair };
