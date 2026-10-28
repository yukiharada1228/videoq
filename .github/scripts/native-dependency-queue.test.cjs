const { test } = require('node:test');
const assert = require('node:assert/strict');
const native = require('./native-dependency-queue.cjs');
const SHA = 'a'.repeat(40), BASE = 'b'.repeat(40), GROUP = 'c'.repeat(40);
const context = { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main', eventName: 'push', payload: {} };
function fixture() {
  const pr = { number: 1, node_id: 'PR_1', state: 'open', draft: false, user: { login: 'dependabot[bot]' },
    base: { ref: 'main' }, head: { sha: SHA, ref: 'dependabot/npm_and_yarn/test', repo: { full_name: 'videoq-jp/videoq' } }, labels: [] };
  const f = { pr, comments: [], reserved: [], repairs: [], dispatches: [], disabled: [], queued: false, outcome: 'success', proofs: true };
  f.protection = { enforce_admins: { enabled: true }, required_status_checks: { strict: false,
    checks: ['CI Success', 'Supply Chain Security', 'Terraform Plan', 'Container Validation'].map(context => ({ context, app_id: 15368 })) } };
  f.rules = [{ type: 'merge_queue', parameters: { max_entries_to_build: 1, max_entries_to_merge: 1, merge_method: 'MERGE' } }];
  f.run = { id: 50, run_attempt: 1, workflow_id: 10, event: 'merge_group', status: 'completed', conclusion: 'failure',
    head_sha: GROUP, head_branch: 'gh-readonly-queue/main/pr-1-deadbeef', repository: { full_name: 'videoq-jp/videoq' }, head_repository: { full_name: 'videoq-jp/videoq' } };
  const methods = {
    repos: { getBranch: async () => ({ data: { commit: { sha: BASE } } }),
      getBranchProtection: async () => ({ data: f.protection }), getRulesForBranch: async () => ({ data: f.rules }),
      compareCommits: async ({ base }) => ({ data: base === SHA ? { merge_base_commit: { sha: f.ancestor || SHA } } : { behind_by: 1 } }) },
    pulls: { list: async () => [pr], get: async () => ({ data: pr }) },
    issues: { createComment: async ({ body }) => { f.comments.push({ user: { login: 'github-actions[bot]' }, body }); } },
    actions: { createWorkflowDispatch: async data => f.dispatches.push(data), getWorkflowRun: async () => ({ data: f.run }),
      getWorkflow: async () => ({ data: { id: 10 } }), listWorkflowRuns: async () => ({ data: { workflow_runs: [f.run] } }) },
  };
  f.github = { rest: methods, paginate: (method, args) => method(args) };
  f.writerGithub = { rest: methods, graphql: async (query, values) => {
    if (query.startsWith('mutation')) { f.disabled.push(values.id); return; }
    return { repository: { pullRequest: { mergeQueueEntry: f.queued ? { id: 'entry' } : null } } };
  } };
  f.verify = async () => f.proofs ? { pr, kind: 'dependabot', comments: f.comments } : null;
  f.args = { github: f.github, writerGithub: f.writerGithub, context, verify: f.verify,
    evidence: async () => ['ci.yml', 'container-validation.yml', 'terraform-plan.yml'].map((workflow_id, i) => ({
      workflow_id, admitted: true, run: { id: i + 1, status: 'completed', conclusion: f.outcome },
    })), reserve: async data => f.reserved.push(data), prepareRepair: async data => f.repairs.push(data) };
  return f;
}
test('successful eligible PR queues its exact head without a main rebase or issue lease', async () => {
  const f = fixture(); await native.reconcile(f.args);
  assert.deepEqual(f.reserved, [{ number: 1, sha: SHA }]); assert.equal(f.comments.length, 0); assert.equal(f.dispatches.length, 0);
});
test('native protection fails closed for missing checks, spoofed apps, missing queue, admin bypass and speculative builds', async () => {
  for (const mutate of [f => f.protection.required_status_checks.checks.pop(), f => f.protection.required_status_checks.checks[0].app_id = 1,
    f => f.rules = [], f => f.protection.enforce_admins.enabled = false, f => f.rules[0].parameters.max_entries_to_build = 2,
    f => f.protection.required_status_checks.strict = true]) {
    const f = fixture(); mutate(f); await assert.rejects(native.reconcile(f.args), /requires protected main/); assert.equal(f.reserved.length, 0);
  }
});
test('queued PRs are left to GitHub and an unverified bot proposal loses auto-merge', async () => {
  const f = fixture(); f.queued = true; await native.reconcile(f.args); assert.equal(f.reserved.length, 0);
  f.proofs = false; f.pr.auto_merge = {}; await native.reconcile(f.args); assert.deepEqual(f.disabled, ['PR_1']);
});
test('a normal eligible CI failure uses the existing bounded Claude authorizer', async () => {
  const f = fixture(); f.outcome = 'failure'; await native.reconcile({ ...f.args, repairEnabled: true, authorizeRepair: true });
  assert.equal(f.repairs.length, 1); assert.equal(f.repairs[0].runId, 1); assert.equal(f.reserved.length, 0);
});
test('PR metadata events wake trusted main rather than authorize a model', async () => {
  const f = fixture(); f.outcome = 'failure'; await native.reconcile({ ...f.args, repairEnabled: true });
  assert.equal(f.repairs.length, 0); assert.equal(f.dispatches[0].workflow_id, 'dependency-queue.yml');
});
test('group failure needs a genuine workflow, canonical repositories and proof of the current PR head ancestry', async () => {
  for (const mutate of [f => f.run.event = 'pull_request', f => f.run.head_repository.full_name = 'fork/videoq',
    f => f.ancestor = BASE, f => f.run.head_branch = 'feature/pr-1-deadbeef']) {
    const f = fixture(); const ctx = { ...context, eventName: 'workflow_run', payload: { workflow_run: { ...f.run } } }; mutate(f);
    assert.equal(await native.reproduceGroupFailure({ ...f.args, context: ctx, sync: async () => { throw Error('unexpected mutation'); } }), null);
    assert.equal(f.comments.length, 0);
  }
});
test('a proven group failure syncs only that PR once, then normal PR CI owns repair', async () => {
  const f = fixture(); const calls = []; const args = { ...f.args, context: { ...context, eventName: 'workflow_run', payload: { workflow_run: f.run } }, sync: async data => calls.push(data) };
  assert.equal(await native.reproduceGroupFailure(args), 1);
  assert.equal(calls.length, 1); assert.equal(calls[0].nativeQueue, true); assert.equal(calls[0].expectedSha, SHA);
  assert.equal(await native.reproduceGroupFailure(args), null); assert.equal(calls.length, 1);
});
