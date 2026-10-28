const { test } = require('node:test');
const assert = require('node:assert/strict');
const q = require('./dependency-queue.cjs');
const SHA = 'a'.repeat(40), BASE = 'b'.repeat(40);
const context = { repo: { owner: 'yukiharada1228', repo: 'videoq' }, ref: 'refs/heads/main', payload: {} };
function pr(number, login = 'dependabot[bot]') {
  return { number, node_id: `PR_${number}`, user: { login }, state: 'open', base: { ref: 'main' },
    head: { sha: SHA, ref: `dependabot/npm_and_yarn/${number}`, repo: { full_name: 'yukiharada1228/videoq' } }, labels: [], auto_merge: {} };
}
function fixture(pulls = [pr(1), pr(2)]) {
  const f = { pulls, comments: [], checks: [], reruns: [], dispatches: [], jobs: {}, conclusions: {}, disabled: [], behind: 0 };
  const methods = {
    issues: {
      listComments: async () => f.comments,
      createComment: async data => { const comment = { id: 1, user: { login: 'github-actions[bot]' }, body: data.body }; f.comments.push(comment); return { data: comment }; },
      updateComment: async data => { f.comments[0].body = data.body; },
    },
    repos: { getBranch: async () => ({ data: { commit: { sha: BASE } } }),
      compareCommits: async () => ({ data: { behind_by: f.behind } }) },
    pulls: { list: async () => f.pulls, get: async ({ pull_number }) => ({ data: f.pulls.find(p => p.number === pull_number) }) },
    checks: {
      listForRef: async ({ ref }) => f.checks.filter(c => c.head_sha === ref),
      create: async data => { f.checks.push({ id: f.checks.length + 1, app: { id: 15368 }, conclusion: null, ...data }); },
      update: async data => { Object.assign(f.checks.find(c => c.id === data.check_run_id), data); },
    },
    actions: {
      listWorkflowRuns: async ({ workflow_id, head_sha }) => ({ data: { workflow_runs: [{ id: workflow_id === 'ci.yml' ? 11 : workflow_id === 'container-validation.yml' ? 12 : 13,
        head_sha, run_attempt: 1, status: 'completed', conclusion: f.conclusions[workflow_id] || 'success' }] } }),
      listJobsForWorkflowRun: async ({ run_id }) => f.jobs[run_id] || [],
      reRunWorkflow: async data => { f.reruns.push(data.run_id); },
      createWorkflowDispatch: async data => { f.dispatches.push(data); },
    },
  };
  f.github = { rest: methods, paginate: (method, args) => method(args) };
  f.protection = { required_status_checks: { strict: true, checks:
    ['CI Success', 'Supply Chain Security', 'Terraform Plan', 'Container Validation', 'Dependency Queue'].map(context => ({ context, app_id: 15368 })) } };
  f.writerGithub = { rest: { repos: { getBranchProtection: async () => ({ data: f.protection }) } },
    graphql: async (_, data) => { f.disabled.push(data.id); } };
  f.args = { github: f.github, writerGithub: f.writerGithub, context, issue: 5,
    verify: async ({ pr }) => ({ pr, kind: 'dependabot' }) };
  f.state = () => q.parse(f.comments).state;
  return f;
}
const admitted = [{ name: 'Queue Admission', steps: [{ name: 'Queue slot admitted', conclusion: 'success' }] }];
test('managed scope excludes development, forks, and next-line runtime PRs', () => {
  assert.equal(q.managed(pr(1)), true);
  assert.equal(q.managed(pr(1, 'developer')), false);
  const fork = pr(1); fork.head.repo.full_name = 'other/videoq';
  assert.equal(q.managed(fork), false);
  const runtime = pr(1, 'yuki-dependency-patches-20261022[bot]'); runtime.head.ref = 'runtime/python-next';
  assert.equal(q.managed(runtime), false);
  runtime.head.ref = 'runtime/python-current';
  assert.equal(q.managed(runtime), true);
});
test('unknown bot heads defer CI while normal PRs run immediately', async () => {
  const f = fixture();
  assert.equal(await q.admission({ ...f.args, context: { ...context, payload: { pull_request: pr(1) } }, enabled: true }), false);
  assert.equal(await q.admission({ ...f.args, context: { ...context, payload: { pull_request: pr(1, 'developer') } }, enabled: true }), true);
});
test('one slot is admitted; only its lightweight runs are rerun', async () => {
  const f = fixture();
  await q.reconcile(f.args);
  assert.equal(f.state().active, 1);
  assert.equal(f.state().entries[1].mode, 'active');
  assert.equal(f.state().entries[2].mode, 'waiting');
  assert.deepEqual(f.reruns, [11, 12]);
  assert.equal(await q.admission({ ...f.args, enabled: true, context: { ...context, payload: { pull_request: pr(1) } } }), true);
  assert.equal(await q.admission({ ...f.args, enabled: true, context: { ...context, payload: { pull_request: pr(2) } } }), false);
});
test('old SHA or stale main cannot borrow an active slot', async () => {
  const f = fixture(); await q.reconcile(f.args);
  const changed = pr(1); changed.head.sha = 'c'.repeat(40);
  assert.equal(await q.admission({ ...f.args, enabled: true, context: { ...context, payload: { pull_request: changed } } }), false);
  f.github.rest.repos.getBranch = async () => ({ data: { commit: { sha: 'd'.repeat(40) } } });
  assert.equal(await q.admission({ ...f.args, enabled: true, context: { ...context, payload: { pull_request: pr(1) } } }), false);
});
test('skipped CI cannot complete the required queue gate or cause endless reruns', async () => {
  const f = fixture(); await q.reconcile(f.args); await q.reconcile(f.args);
  assert.deepEqual(f.reruns, [11, 12]);
  assert.equal(f.checks.some(c => c.conclusion === 'success'), false);
  assert.equal(q.result([{ admitted: false, run: { status: 'completed', conclusion: 'success' } }]), 'waiting');
});
test('failed admitted CI releases the slot and advances without retrying the failed head', async () => {
  const f = fixture(); f.jobs[11] = admitted; f.conclusions['ci.yml'] = 'failure';
  await q.reconcile(f.args);
  assert.equal(f.state().active, null);
  assert.equal(f.state().failed[1], SHA);
  assert.equal(f.dispatches[0].workflow_id, 'dependency-queue.yml');
  await q.reconcile(f.args);
  assert.equal(f.state().active, null); // the second PR also fails this fixture's CI
  assert.equal(f.state().failed[2], SHA);
  f.conclusions['ci.yml'] = 'success'; f.jobs[11] = [];
  await q.reconcile(f.args);
  assert.equal(f.state().active, null);
});
test('a repaired head re-enters; an explicit retry clears only that failed PR', async () => {
  const f = fixture([pr(1)]); f.jobs[11] = admitted; f.conclusions['ci.yml'] = 'failure';
  await q.reconcile(f.args);
  f.conclusions['ci.yml'] = 'success'; f.jobs[11] = [];
  f.pulls[0].head.sha = 'e'.repeat(40);
  await q.reconcile(f.args);
  assert.equal(f.state().active, 1);
  f.pulls[0].head.sha = SHA;
  await q.reconcile({ ...f.args, retry: 1 });
  assert.equal(f.state().active, 1);
  assert.equal(f.state().failed[1], undefined);
});
test('all admitted workflows must finish before gate success', () => {
  const good = { admitted: true, run: { status: 'completed', conclusion: 'success' } };
  assert.equal(q.result([good, { admitted: true, run: { status: 'in_progress' } }]), 'waiting');
  assert.equal(q.result([good, good]), 'success');
  assert.equal(q.result([good, { admitted: true, run: { status: 'completed', conclusion: 'cancelled' } }]), 'failure');
});
test('explicit retry reruns a failed admitted workflow instead of immediately failing it again', async () => {
  const f = fixture([pr(1)]); f.jobs[11] = admitted; f.jobs[12] = admitted;
  f.conclusions['ci.yml'] = 'failure';
  await q.reconcile(f.args);
  assert.equal(f.state().active, null);
  await q.reconcile({ ...f.args, retry: 1 });
  assert.equal(f.state().active, 1);
  assert.equal(f.state().failed[1], undefined);
  assert.deepEqual(f.reruns, [11]);
});
test('a required Terraform failure releases the slot even if application CI passed', async () => {
  const f = fixture([pr(1)]); f.jobs[11] = admitted; f.jobs[12] = admitted;
  f.conclusions['terraform-plan.yml'] = 'failure';
  await q.reconcile(f.args);
  assert.equal(f.state().failed[1], SHA);
  assert.equal(f.state().active, null);
});
test('unverified bot proposals lose auto-merge and still need actual full CI', async () => {
  const f = fixture([pr(1)]);
  await q.reconcile({ ...f.args, verify: async () => null });
  assert.deepEqual(f.disabled, ['PR_1']);
  assert.equal(f.state().entries[1].mode, 'bypass');
  assert.equal(f.checks.at(-1).conclusion, null);
  assert.deepEqual(f.reruns, [11, 12]);
});
test('human PRs receive a queue exemption without altering their CI or merge reservation', async () => {
  const f = fixture([pr(1, 'developer')]); await q.reconcile(f.args);
  assert.equal(f.checks.at(-1).conclusion, 'success');
  assert.equal(f.reruns.length, 0);
  assert.equal(f.disabled.length, 0);
});
test('manual bot PRs with pre-queue full CI do not rerun forever during migration', async () => {
  const f = fixture([pr(1)]);
  f.jobs[11] = [{ name: 'Deployment Security Tests' }];
  f.jobs[12] = [{ name: 'Container Validation' }];
  await q.reconcile({ ...f.args, verify: async () => null });
  assert.equal(f.checks.at(-1).conclusion, 'success');
  assert.equal(f.reruns.length, 0);
  f.jobs[11] = [{ name: 'Queue Admission', steps: [{ name: 'Queue slot admitted', conclusion: 'skipped' }] }];
  await q.reconcile({ ...f.args, verify: async () => null });
  assert.equal(f.checks.at(-1).conclusion, null);
  assert.deepEqual(f.reruns, [11]);
});
test('queue state ignores lookalike comments from other users', () => {
  const state = q.parse([{ user: { login: 'attacker' }, body: q.MARKER + '\n{"active":1}' }]).state;
  assert.equal(state.active, undefined);
});
test('the sole controller refuses to act if any required gate or trusted check source is removed', async () => {
  for (const name of ['CI Success', 'Supply Chain Security', 'Terraform Plan', 'Container Validation', 'Dependency Queue']) {
    const f = fixture(); f.protection.required_status_checks.checks = f.protection.required_status_checks.checks.filter(c => c.context !== name);
    await assert.rejects(q.reconcile(f.args));
    assert.equal(f.checks.length, 0);
    assert.equal(f.reruns.length, 0);
  }
  const f = fixture(); f.protection.required_status_checks.checks.at(-1).app_id = 999;
  await assert.rejects(q.reconcile(f.args));
});
test('successful actual validations complete the gate and reserve the exact head only in the controller', async () => {
  const f = fixture([pr(1)]); f.pulls[0].auto_merge = null;
  f.jobs[11] = admitted; f.jobs[12] = [{ ...admitted[0], name: 'Queue Admission / admission' }];
  const merges = [];
  await q.reconcile({ ...f.args, reserve: async args => merges.push(args) });
  assert.equal(f.checks.at(-1).conclusion, 'success');
  assert.deepEqual(merges, [{ number: 1, sha: SHA }]);
});
test('a coalesced workflow event still authorizes a current failed CI from durable queue state', async () => {
  const f = fixture([pr(1)]); f.jobs[11] = admitted; f.conclusions['ci.yml'] = 'failure';
  await q.reconcile(f.args); // Original failure event only released the slot.
  const requests = [];
  await q.reconcile({ ...f.args, repairEnabled: true, authorizeRepair: true,
    prepareRepair: async args => requests.push(args.runId) });
  assert.deepEqual(requests, [11]);
  assert.equal(f.state().active, null);
});
test('PR target events wake the main controller rather than authorizing model execution', async () => {
  const f = fixture([pr(1)]); f.jobs[11] = admitted; f.conclusions['ci.yml'] = 'failure';
  let called = false;
  await q.reconcile({ ...f.args, repairEnabled: true, authorizeRepair: false,
    prepareRepair: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(f.dispatches.at(-1).workflow_id, 'dependency-queue.yml');
});
test('failed security checks and already attempted heads never dispatch another model job', async () => {
  for (const receipt of [{ kind: 'attempt', sha: SHA }, { kind: 'security-stop', sha: SHA }, { kind: 'stopped' }]) {
    const f = fixture([pr(1)]); f.jobs[11] = admitted; f.conclusions['ci.yml'] = 'failure';
    let called = false;
    await q.reconcile({ ...f.args, repairEnabled: true, authorizeRepair: true,
      verify: async ({ pr }) => ({ pr, kind: 'dependabot', comments: [{ user: { login: 'github-actions[bot]' },
        body: '<!-- videoq-claude-dependency-v1 -->\n' + JSON.stringify(receipt) }] }),
      prepareRepair: async () => { called = true; } });
    assert.equal(called, false);
  }
});
