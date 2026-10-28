const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const p = require('./claude-dependency-repair.cjs');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const repo = 'videoq-jp/videoq';
const metadata = { ecosystem: 'npm_and_yarn', updateType: 'version-update:semver-minor', maintainerChanges: 'false' };
const bot = (sha = A) => ({ sha, author: { login: 'dependabot[bot]' }, commit: { verification: { verified: true } } });
const comment = r => ({ user: { login: 'github-actions[bot]' }, body: '<!-- videoq-claude-dependency-v1 -->\n' + JSON.stringify(r) });
const seed = () => comment({ kind: 'seed', sha: A, metadata });
const receipt = (sha = B, parent = A) => comment({ kind: 'published', sha, parent, origin: A, runId: '77' });
const source = (filename = 'apps/web/src/components/player.tsx') => ({ filename, status: 'modified', patch: '-old\n+new', changes: 2 });

function fixture(repaired = false) {
  const f = { context: { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main', runId: 77 }, runId: '99',
    pr: { number: 1, state: 'open', draft: false, node_id: 'PR_1', user: { login: 'dependabot[bot]' }, labels: [],
      head: { ref: 'dependabot/npm_and_yarn/update', sha: repaired ? B : A, repo: { full_name: repo } },
      base: { ref: 'main', sha: C, repo: { full_name: repo } } },
    comments: [seed()], commits: [bot()], original: [{ filename: 'package-lock.json', status: 'modified' }],
    diff: [source()], mutations: [], jobs: [...['Supply Chain Security', 'Deployment Security Tests'].map(name => ({ name, conclusion: 'success' })),
      { name: 'Hono (apps/api)', conclusion: repaired ? 'success' : 'failure' }],
    protection: { required_status_checks: { strict: true, checks: ['CI Success', 'Supply Chain Security'].map(context => ({ context, app_id: 15368 })) } },
  };
  if (repaired) { f.comments.push(receipt()); f.commits.push({ sha: B, parents: [{ sha: A }] }); }
  f.run = { id: 99, workflow_id: 42, event: 'pull_request', status: 'completed', conclusion: repaired ? 'success' : 'failure',
    repository: { full_name: repo }, head_repository: { full_name: repo }, head_branch: f.pr.head.ref, head_sha: f.pr.head.sha, run_attempt: 1 };
  f.latest = f.run;
  f.github = { paginate: (method, args) => method(args), graphql: async () => { f.mutations.push('disable'); f.pr.auto_merge = null; }, rest: {
    actions: { getWorkflowRun: async a => ({ data: String(a.run_id) === '77' ? {
      workflow_id: 43, repository: { full_name: repo }, head_repository: { full_name: repo }, head_branch: 'main', event: 'workflow_run',
    } : f.run }), getWorkflow: async a => ({ data: { id: a.workflow_id === 'ci.yml' ? 42 : a.workflow_id === 'dependency-queue.yml' ? 43 : 44 } }),
      listWorkflowRuns: async () => ({ data: { workflow_runs: [f.latest] } }), listJobsForWorkflowRun: async () => f.jobs },
    pulls: { list: async () => ({ data: [f.pr] }), get: async () => ({ data: f.pr }), listFiles: async () => f.original,
      listCommits: async () => f.commits },
    issues: { listComments: async () => f.comments, createComment: async a => { f.comments.push(comment(JSON.parse(a.body.split('\n')[1]))); f.mutations.push('comment'); } },
    repos: { compareCommitsWithBasehead: async a => ({ data: { total_commits: 1, files: a.basehead.endsWith('...' + A) ? f.original : f.diff } }),
      getBranchProtection: async () => ({ data: f.protection }) },
  } };
  f.writerGithub = f.github;
  return f;
}

test('only a contiguous receipt-backed repair chain can inherit verified Dependabot metadata', () => {
  const f = fixture(true);
  assert.ok(p.chain(f.commits, f.comments));
  for (const mutate of [
    f => { f.comments[1].user.login = 'owner'; },
    f => { f.commits[1].parents = [{ sha: C }]; },
    f => { f.commits[0].commit.verification.verified = false; },
    f => { f.commits.push({ sha: C, parents: [{ sha: B }] }); },
  ]) { const bad = fixture(true); mutate(bad); assert.equal(p.chain(bad.commits, bad.comments), null); }
});
test('source scope excludes checks, dependency files, credentials, traversal and config', () => {
  assert.equal(p.validRepairFiles([source()]), true);
  for (const filename of ['.github/workflows/ci.yml', 'package.json', 'apps/web/src/x.test.ts', 'apps/web/src/__tests__/x.ts',
    'apps/web/src/../../config.ts', 'apps/worker/worker_python/env.py', 'apps/worker/worker_python/secrets_bootstrap.py',
    'apps/api/src/auth/session.ts', 'apps/api/src/db/migrations/migrate.ts', 'apps/web/vite.config.ts', 'apps/web/src/types.d.ts']) {
    assert.equal(p.validRepairFiles([source(filename)]), false, filename);
  }
  for (const files of [[], [source(), { ...source(), status: 'added' }], [{ ...source(), patch: undefined }],
    [{ ...source(), changes: 301 }], Array.from({ length: 9 }, () => source())]) assert.equal(p.validRepairFiles(files), false);
});
test('current failed originals and successful repaired heads are eligible', async () => {
  assert.ok(await p.candidate(fixture()));
  const f = fixture(true);
  assert.ok(await p.candidate(f));
});
for (const [name, mutate] of [
  ['fork', f => { f.pr.head.repo.full_name = 'attacker/repo'; }],
  ['major', f => { f.comments[0] = comment({ kind: 'seed', sha: A, metadata: { ...metadata, updateType: 'version-update:semver-major' } }); }],
  ['unsupported ecosystem', f => { f.comments[0] = comment({ kind: 'seed', sha: A, metadata: { ...metadata, ecosystem: 'terraform' } }); }],
  ['stale head', f => { f.pr.head.sha = C; }],
  ['new CI', f => { f.latest = { ...f.run, id: 100 }; }],
  ['new attempt', f => { f.latest = { ...f.run, run_attempt: 2 }; }],
  ['wrong workflow', f => { f.run.workflow_id = 100; }],
  ['human commit', f => { f.commits.push({ sha: B }); f.pr.head.sha = B; f.run.head_sha = B; }],
  ['no-claude', f => { f.pr.labels.push({ name: 'no-claude' }); }],
  ['no-automerge', f => { f.pr.labels.push({ name: 'no-automerge' }); }],
  ['legacy manual repair', f => { f.comments.push({ user: { login: 'github-actions[bot]' }, body: '<!-- videoq-codex-repair-request -->' }); }],
  ['untrusted seed', f => { f.comments[0].user.login = 'owner'; }],
  ['original source change', f => { f.original.push(source()); }],
]) test(`candidate rejects ${name}`, async () => { const f = fixture(); mutate(f); assert.equal(await p.candidate(f), null); });

test('a receipt does not authorize a forbidden patch', async () => {
  const f = fixture(true); f.diff = [source('.github/workflows/ci.yml')];
  assert.equal(await p.candidate(f), null);
});
test('attempts are durable, deduplicated by SHA, and bounded across CI reruns', async () => {
  const f = fixture(); f.pr.auto_merge = {};
  assert.deepEqual(await p.scope(f), { number: 1, sha: A, branch: f.pr.head.ref, origin: A });
  assert.equal(f.mutations[0], 'disable');
  assert.equal(await p.scope(f), null);
  assert.equal(p.records(f.comments, 'stopped').length, 0);
  f.run.run_attempt = 2;
  assert.equal(await p.scope(f), null);
  assert.equal(p.records(f.comments, 'attempt').length, 1);
  const repaired = fixture(true); repaired.run.conclusion = 'failure';
  repaired.comments.push(comment({ kind: 'attempt', sha: A }), comment({ kind: 'attempt', sha: C }));
  assert.equal(await p.scope(repaired), null);
});
test('security failures stop before invoking Claude', async () => {
  const f = fixture(); f.jobs[0].conclusion = 'failure';
  assert.equal(await p.scope(f), null);
  assert.equal(p.records(f.comments, 'attempt').length, 0);
  assert.equal(p.records(f.comments, 'security-stop').length, 1);
});
test('coverage upload failures and aggregate failures cannot consume source repair attempts', async () => {
  const f = fixture();
  f.jobs = f.jobs.filter(job => job.conclusion === 'success');
  f.jobs.push({ name: 'Frontend Coverage', conclusion: 'failure' }, { name: 'CI Success', conclusion: 'failure' });
  assert.equal(await p.scope(f), null);
  assert.equal(p.records(f.comments, 'attempt').length, 0);
});
test('an actual application failure can be repaired while coverage reporting is unavailable', async () => {
  const f = fixture(); f.jobs.push({ name: 'Frontend Coverage', conclusion: 'failure' });
  assert.equal((await p.scope(f)).sha, A);
  assert.equal(p.records(f.comments, 'attempt').length, 1);
});
test('repair preparation cancels auto-merge with the App while keeping records on the standard token', async () => {
  const f = fixture(); f.pr.auto_merge = {};
  f.github.graphql = async () => { throw new Error('Resource not accessible by integration'); };
  let disabled = false;
  f.writerGithub = { graphql: async () => { disabled = true; f.pr.auto_merge = null; } };
  assert.ok(await p.scope(f));
  assert.equal(disabled, true);
  assert.equal(p.records(f.comments, 'attempt').length, 1);
  const failure = fixture(); failure.pr.auto_merge = {};
  failure.writerGithub = { graphql: async () => { throw new Error('App unavailable'); } };
  await assert.rejects(p.scope(failure), /App unavailable/);
  assert.equal(p.records(failure.comments, 'attempt').length, 0);
});
test('fresh checkout validates real patches including file modes and line limits', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'claude-repair-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
  git('init', '--quiet'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  mkdirSync(join(cwd, 'apps/web/src'), { recursive: true });
  const path = join(cwd, 'apps/web/src/player.ts'); writeFileSync(path, 'export const player = 1;\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'initial');
  writeFileSync(path, 'export const player = 2;\n');
  const patch = join(cwd, 'repair.patch'); writeFileSync(patch, git('diff'));
  git('restore', 'apps/web/src/player.ts');
  assert.deepEqual(p.applyPatch(cwd, patch), ['apps/web/src/player.ts']);
  assert.match(readFileSync(path, 'utf8'), /= 2/);
  git('restore', '--staged', 'apps/web/src/player.ts'); git('restore', 'apps/web/src/player.ts');
  writeFileSync(patch, 'diff --git a/apps/web/src/player.ts b/apps/web/src/player.ts\nold mode 100644\nnew mode 100755\n');
  assert.throws(() => p.applyPatch(cwd, patch), /Forbidden repair path or mode/);
});
test('workflow keeps model access read-only and publishing isolated', () => {
  const workflow = readFileSync(join(__dirname, '../workflows/dependency-queue.yml'), 'utf8');
  const worker = readFileSync(join(__dirname, '../workflows/claude-dependency-worker.yml'), 'utf8');
  const repair = worker.split('\n  repair:')[1].split('\n  publish:')[0];
  assert.doesNotMatch(repair, /PATCH_BOT_PRIVATE_KEY|contents: write|pull-requests: write/);
  assert.match(repair, /persist-credentials: false/);
  assert.match(worker, /workflow_dispatch:/);
  assert.match(repair, /Revalidate the trusted repair authorization/);
  for (const action of (workflow + worker).matchAll(/uses: ([^\s]+)/g)) {
    if (!action[1].startsWith('./')) assert.match(action[1], /@[a-f0-9]{40}$/);
  }
  assert.match(readFileSync(join(__dirname, 'native-dependency-queue.cjs'), 'utf8'), /expectedHeadOid:\$sha/);
  assert.match(worker, /group: dependency-automation-\$\{\{ inputs\.number \}\}/);
});

test('publication uses a separate writer, records exact parent, and never force pushes', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'claude-publish-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
  git('init', '--quiet'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  mkdirSync(join(cwd, 'apps/web/src'), { recursive: true });
  const path = join(cwd, 'apps/web/src/player.ts'); writeFileSync(path, 'export const player = 1;\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'initial');
  writeFileSync(path, 'export const player = 2;\n');
  const patchPath = join(cwd, 'repair.patch'); writeFileSync(patchPath, git('diff'));
  git('restore', 'apps/web/src/player.ts');
  const f = fixture();
  f.comments.push(comment({ kind: 'attempt', sha: A, runId: '77' }));
  f.comments.push(comment({ kind: 'worker-start', sha: A, runId: '77', authorizationRun: '77' }));
  const calls = [];
  f.writerGithub = { rest: {
    pulls: f.github.rest.pulls,
    git: {
      createBlob: async a => { calls.push(['blob', a]); return { data: { sha: C } }; },
      getCommit: async () => ({ data: { tree: { sha: C } } }),
      createTree: async a => { calls.push(['tree', a]); return { data: { sha: C } }; },
      createCommit: async a => { calls.push(['commit', a]); return { data: { sha: B } }; },
      updateRef: async a => { assert.equal(p.records(f.comments, 'published')[0].sha, B); calls.push(['push', a]); },
    },
  } };
  await p.publish({ ...f, cwd, patchPath, expectedSha: A, authorizationRun: '77' });
  assert.deepEqual(calls.find(([name]) => name === 'commit')[1].parents, [A]);
  assert.equal(calls.find(([name]) => name === 'push')[1].force, false);
  assert.equal(calls.find(([name]) => name === 'tree')[1].tree[0].path, 'apps/web/src/player.ts');
  assert.match(Buffer.from(calls[0][1].content, 'base64').toString(), /player = 2/);
  const stale = fixture();
  await assert.rejects(p.publish({ ...stale, cwd, patchPath, expectedSha: B }), /Stale or unapproved/);
});

test('worker execution requires a real coordinator run and is claimed only once', async () => {
  const f = fixture();
  f.comments.push(comment({ kind: 'attempt', sha: A, runId: '77' }));
  const args = { ...f, expectedSha: A, authorizationRun: '77', number: 1 };
  await p.claimWorker(args);
  await assert.rejects(p.claimWorker(args), /already claimed/);
  const bad = fixture();
  bad.comments.push(comment({ kind: 'attempt', sha: A, runId: '99' }));
  assert.equal(await p.authorizedAttempt({ ...bad, c: await p.candidate(bad), authorizationRun: '99' }), false);
});
test('only main runs of the single controller can authorize a worker; retired routes and PR events are rejected', async () => {
  for (const event of ['push', 'workflow_run', 'workflow_dispatch', 'pull_request_target']) {
    const f = fixture(); f.comments.push(comment({ kind: 'attempt', sha: A, runId: '77' }));
    const c = await p.candidate(f);
    f.github.rest.actions.getWorkflowRun = async () => ({ data: { workflow_id: 43, event,
      repository: { full_name: repo }, head_repository: { full_name: repo }, head_branch: 'main' } });
    assert.equal(await p.authorizedAttempt({ ...f, c, authorizationRun: '77' }), event !== 'pull_request_target');
    f.github.rest.actions.getWorkflowRun = async () => ({ data: { workflow_id: 44, event: 'workflow_run',
      repository: { full_name: repo }, head_repository: { full_name: repo }, head_branch: 'main' } });
    assert.equal(await p.authorizedAttempt({ ...f, c, authorizationRun: '77' }), false);
  }
});
test('the controller verifies a failed head and records authorization before dispatching the isolated worker', async () => {
  const f = fixture(); const dispatches = [];
  f.github.rest.actions.createWorkflowDispatch = async args => {
    assert.equal(p.records(f.comments, 'attempt')[0].sha, A);
    dispatches.push(args);
  };
  await require('./dependency-queue.cjs').repairFailure(f);
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].workflow_id, 'claude-dependency-worker.yml');
  assert.deepEqual(dispatches[0].inputs, { number: '1', sha: A, run_id: '99', authorization_run: '77' });
});
