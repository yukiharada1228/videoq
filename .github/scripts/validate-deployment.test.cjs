const { test } = require('node:test');
const assert = require('node:assert/strict');
const validate = require('./validate-deployment.cjs');

const sha = 'a'.repeat(40);
const repository = { full_name: 'yukiharada1228/videoq' };
function fixture(eventName = 'workflow_run') {
  const run = {
    id: 12, workflow_id: 4, event: 'push', head_branch: 'main', head_sha: sha,
    repository, head_repository: repository, status: 'completed', conclusion: 'success', run_attempt: 1,
  };
  const context = {
    repo: { owner: 'yukiharada1228', repo: 'videoq' }, ref: 'refs/heads/main', sha,
    eventName, payload: eventName === 'workflow_run' ? { workflow_run: { ...run } } : {},
  };
  const calls = [];
  const github = { rest: {
    repos: { getBranch: async () => ({ data: { commit: { sha } } }) },
    actions: {
      getWorkflow: async () => ({ data: { id: 4 } }),
      listWorkflowRuns: async () => ({ data: { workflow_runs: [run] } }),
      getWorkflowRun: async ({ run_id }) => { calls.push(run_id); return { data: run }; },
    },
  } };
  return { github, context, run, calls };
}

test('deploys the verified commit after main push CI succeeds', async () => {
  assert.equal(await validate(fixture()), sha);
});
test('manual deployment requires successful CI for that same main commit', async () => {
  assert.equal(await validate(fixture('workflow_dispatch')), sha);
});
for (const [name, mutation] of [
  ['PR CI, even from a branch named main', f => { f.context.payload.workflow_run.event = 'pull_request'; }],
  ['fork source with a branch named main', f => { f.context.payload.workflow_run.head_repository = { full_name: 'attacker/videoq' }; }],
  ['CI in another repository', f => { f.context.payload.workflow_run.repository = { full_name: 'attacker/videoq' }; }],
  ['non-main CI branch', f => { f.context.payload.workflow_run.head_branch = 'feature'; }],
  ['failed triggering CI', f => { f.context.payload.workflow_run.conclusion = 'failure'; }],
  ['stale deployment after main advances', f => { f.context.payload.workflow_run.head_sha = 'b'.repeat(40); }],
  ['a different workflow named CI', f => { f.run.workflow_id = 5; }],
  ['API reports a different source SHA', f => { f.run.head_sha = 'b'.repeat(40); }],
  ['API reports fork source', f => { f.run.head_repository = { full_name: 'attacker/videoq' }; }],
  ['CI rerun superseded the triggering attempt', f => { f.run.run_attempt = 2; }],
  ['missing workflow_run payload', f => { f.context.payload = {}; }],
  ['unsupported event', f => { f.context.eventName = 'pull_request'; }],
]) {
  test(`rejects ${name}`, async () => {
    const f = fixture(); mutation(f);
    await assert.rejects(validate(f));
  });
}
for (const ref of ['refs/heads/feature', 'refs/tags/main']) {
  test(`manual deployment rejects ${ref}`, async () => {
    const f = fixture('workflow_dispatch'); f.context.ref = ref;
    await assert.rejects(validate(f));
  });
}
test('a fork cannot run its own copy of the production deployment', async () => {
  const f = fixture(); f.context.repo.owner = 'attacker';
  await assert.rejects(validate(f));
});
test('manual deployment rejects an old dispatch SHA', async () => {
  const f = fixture('workflow_dispatch'); f.context.sha = 'b'.repeat(40);
  await assert.rejects(validate(f));
});
test('manual deployment rejects a commit without CI', async () => {
  const f = fixture('workflow_dispatch');
  f.github.rest.actions.listWorkflowRuns = async () => ({ data: { workflow_runs: [] } });
  await assert.rejects(validate(f));
});
for (const status of ['failure', 'cancelled', 'in_progress']) {
  test(`manual deployment rejects ${status} instead of using an older success`, async () => {
    const f = fixture('workflow_dispatch');
    f.github.rest.actions.listWorkflowRuns = async () => ({ data: { workflow_runs: [{ id: 10 }, { id: 20 }] } });
    f.run.conclusion = status === 'in_progress' ? null : status;
    f.run.status = status === 'in_progress' ? status : 'completed';
    await assert.rejects(validate(f));
    assert.deepEqual(f.calls, [20]);
  });
}
