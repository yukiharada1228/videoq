const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const policy = require('./dependency-automation.cjs');

const REPOSITORY = 'yukiharada1228/videoq';
const SHA = 'a'.repeat(40);
function pull() {
  return { number: 123, state: 'open', draft: false, user: { login: 'dependabot[bot]' }, labels: [],
    head: { ref: 'dependabot/npm_and_yarn/npm-patch-123', sha: SHA, repo: { full_name: REPOSITORY } },
    base: { ref: 'main', repo: { full_name: REPOSITORY } } };
}
const files = () => ['package.json', 'package-lock.json'].map(filename => ({ filename, status: 'modified' }));

test('only same-repository Dependabot manifest updates are eligible', () => {
  assert.equal(policy.eligiblePull(pull(), files(), 'no-automerge'), true);
  for (const change of [
    pr => { pr.state = 'closed'; }, pr => { pr.draft = true; },
    pr => { pr.user.login = 'someone'; }, pr => { pr.head.repo.full_name = 'fork/videoq'; },
    pr => { pr.base.ref = 'develop'; }, pr => { pr.head.ref = 'codex/repair'; },
    pr => { pr.head.sha = 'main'; }, pr => { pr.labels.push({ name: 'no-automerge' }); },
  ]) {
    const pr = pull(); change(pr);
    assert.equal(policy.eligiblePull(pr, files(), 'no-automerge'), false);
  }
  for (const filename of ['infra/main.tf', 'apps/web/src/index.ts']) {
    assert.equal(policy.eligiblePull(pull(), [...files(), { filename, status: 'modified' }], 'no-automerge'), false);
  }
  for (const status of ['added', 'removed', 'renamed']) {
    assert.equal(policy.eligiblePull(pull(), [{ filename: 'package.json', status }], 'no-automerge'), false);
  }
  assert.equal(policy.eligiblePull(pull(), [], 'no-automerge'), false);
});

test('opt-out labels independently control repair and merge', () => {
  const pr = pull(); pr.labels.push({ name: 'no-codex' });
  assert.equal(policy.eligiblePull(pr, files(), 'no-codex'), false);
  assert.equal(policy.eligiblePull(pr, files(), 'no-automerge'), true);
});


test('auto-merge fails closed if required CI or strict protection disappears', () => {
  const protection = { required_status_checks: { strict: true, checks: [{ context: 'CI Success', app_id: 15368 }, { context: 'Supply Chain Security', app_id: 15368 }] } };
  policy.requireProtection(protection);
  for (const value of [{}, { required_status_checks: { strict: false, checks: protection.required_status_checks.checks } },
    { required_status_checks: { strict: true, checks: [{ context: 'CI Success', app_id: 999 }] } }]) {
    assert.throws(() => policy.requireProtection(value));
  }
});

function fixture() {
  const pr = pull();
  const run = { id: 99, workflow_id: 42, event: 'pull_request', status: 'completed', conclusion: 'failure',
    repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY },
    head_branch: pr.head.ref, head_sha: SHA, run_attempt: 1 };
  const f = { pr, run, files: files(), comments: [], mutations: [], latest: run, context: {
    repo: { owner: 'yukiharada1228', repo: 'videoq' }, ref: 'refs/heads/main', eventName: 'workflow_run',
  } };
  f.github = { rest: {
    actions: {
      getWorkflowRun: async () => ({ data: f.run }), getWorkflow: async () => ({ data: { id: 42 } }),
      listWorkflowRuns: async () => ({ data: { workflow_runs: [f.latest] } }),
    },
    pulls: {
      list: async () => ({ data: [f.pr] }),
      get: async () => ({ data: f.pr }), listFiles: async () => f.files,
    },
    issues: {
      listComments: async () => f.comments,
      createComment: async args => {
        f.mutations.push(['create', args]);
        f.comments.push({ id: f.comments.length + 1, user: { login: 'github-actions[bot]' }, body: args.body });
      },
      updateComment: async args => {
        f.mutations.push(['update', args]);
        f.comments.find(comment => comment.id === args.comment_id).body = args.body;
      },
    },
  }, paginate: (method, args) => method(args), graphql: async () => {
    f.mutations.push(['disable-auto']); f.pr.auto_merge = null;
  } };
  f.runId = '99';
  return f;
}

test('a failed current Dependabot run resolves even without payload pull_requests', async () => {
  assert.deepEqual(await policy.repairCandidate(fixture()), {
    number: 123, sha: SHA, runId: 99, attempt: 1,
  });
});
for (const [name, mutate] of [
  ['fork', f => { f.run.head_repository.full_name = 'fork/videoq'; }],
  ['different workflow', f => { f.run.workflow_id = 7; }],
  ['push run', f => { f.run.event = 'push'; }],
  ['success', f => { f.run.conclusion = 'success'; }],
  ['still running', f => { f.run.status = 'in_progress'; }],
  ['stale SHA', f => { f.pr.head.sha = 'b'.repeat(40); }],
  ['closed source PR', f => { f.pr.state = 'closed'; }],
  ['source code change', f => { f.files.push({ filename: 'apps/web/src/app.ts', status: 'modified' }); }],
  ['repair opt-out', f => { f.pr.labels.push({ name: 'no-codex' }); }],
  ['newer CI run', f => { f.latest = { ...f.run, id: 100 }; }],
  ['newer attempt', f => { f.latest = { ...f.run, run_attempt: 2 }; }],
]) {
  test(`repair rejects ${name}`, async () => { const f = fixture(); mutate(f); assert.equal(await policy.repairCandidate(f), null); });
}
test('a repeated CI attempt is allowed but still checks the current source', async () => {
  const f = fixture(); f.run.run_attempt = 2;
  assert.ok(await policy.repairCandidate(f));
  f.pr.head.sha = 'b'.repeat(40);
  assert.equal(await policy.repairCandidate(f), null);
});
test('invalid run IDs and workflow refs fail before API requests', async () => {
  const f = fixture(); f.runId = '1; echo bad';
  await assert.rejects(policy.repairCandidate(f));
  f.runId = '99'; f.context.ref = 'refs/heads/feature';
  await assert.rejects(policy.repairCandidate(f));
});

test('repair requests cancel auto-merge and post only one owner-action notice', async () => {
  const f = fixture(); f.pr.auto_merge = {}; f.pr.node_id = 'PR_123';
  await policy.requestRepair(f);
  await policy.requestRepair(f);
  assert.deepEqual(f.mutations.map(item => item[0]), ['disable-auto', 'create']);
  assert.match(f.comments[0].body, /actions\/runs\/99\/attempts\/1/);
  assert.match(f.comments[0].body, /この通知だけではCodexは実行されません/);
  assert.doesNotMatch(f.comments[0].body, /@codex/);
  assert.equal(policy.eligiblePull(f.pr, f.files, 'no-automerge', f.comments), false);
});

test('a new failed attempt updates the existing notice instead of spamming comments', async () => {
  const f = fixture();
  await policy.requestRepair(f);
  f.run.run_attempt = 2;
  await policy.requestRepair(f);
  assert.deepEqual(f.mutations.map(item => item[0]), ['create', 'update']);
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /attempts\/2/);
});

test('lookalike human comments are neither edited nor treated as bot requests', async () => {
  const f = fixture();
  const body = policy.repairRequestBody({ number: 123, sha: SHA, runId: 99, attempt: 1 });
  f.comments.push({ id: 10, user: { login: 'someone' }, body });
  assert.equal(policy.eligiblePull(f.pr, f.files, 'no-automerge', f.comments), true);
  await policy.requestRepair(f);
  assert.equal(f.comments.length, 2);
  assert.deepEqual(f.mutations.map(item => item[0]), ['create']);
});

test('stale failures and opt-outs never cancel merges or post comments', async () => {
  for (const change of [f => { f.pr.head.sha = 'b'.repeat(40); },
    f => { f.pr.labels.push({ name: 'no-codex' }); },
    f => { f.run.conclusion = 'success'; }]) {
    const f = fixture(); change(f); f.pr.auto_merge = {};
    assert.equal(await policy.requestRepair(f), null);
    assert.equal(f.mutations.length, 0);
  }
});

test('rechecks the PR before making external changes', async () => {
  const f = fixture();
  let reads = 0;
  f.github.rest.pulls.get = async () => {
    reads += 1;
    if (reads === 2) f.pr.head.sha = 'b'.repeat(40);
    return { data: f.pr };
  };
  assert.equal(await policy.requestRepair(f), null);
  assert.equal(f.mutations.length, 0);
});

test('failure to cancel a queued merge prevents a misleading repair notice', async () => {
  const f = fixture(); f.pr.auto_merge = {};
  f.github.graphql = async () => { throw new Error('API unavailable'); };
  await assert.rejects(policy.requestRepair(f), /API unavailable/);
  assert.equal(f.comments.length, 0);
});

test('subscription repair workflow contains no model execution or model credentials', () => {
  const repair = readFileSync(join(__dirname, '../workflows/codex-dependency-repair.yml'), 'utf8');
  const merge = readFileSync(join(__dirname, '../workflows/dependency-automerge.yml'), 'utf8');
  assert.doesNotMatch(repair, /OPENAI_API_KEY|CODEX_AUTH_JSON|auth\.json|openai\/codex-action|codex exec|PATCH_BOT_PRIVATE_KEY/);
  assert.doesNotMatch(repair, /contents: write|npm ci|pip install|ref:.*head_sha/);
  assert.match(repair, /requestRepair/);
  assert.match(repair, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(repair, /group: dependency-automation-\$\{\{ needs\.scope\.outputs\.number \}\}/);
  assert.match(merge, /group: dependency-automation-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.doesNotMatch(merge, /ref:.*pull_request|npm ci|pip install|skip-verification/);
  assert.match(merge, /--match-head-commit/);
  for (const workflow of [repair, merge]) {
    for (const action of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(action[1], /@[a-f0-9]{40}$/);
  }
});
