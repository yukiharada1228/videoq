const { test } = require('node:test');
const assert = require('node:assert/strict');
const q = require('./dependency-queue.cjs');
function pull(login = 'dependabot[bot]', ref = 'dependabot/npm_and_yarn/patch') {
  return { base: { ref: 'main' }, user: { login }, head: { ref, sha: 'a'.repeat(40), repo: { full_name: 'videoq-jp/videoq' } } };
}
test('managed scope excludes development, forks and next-line runtime updates', () => {
  assert.equal(q.managed(pull()), true);
  assert.equal(q.managed(pull('developer')), false);
  const fork = pull(); fork.head.repo.full_name = 'fork/videoq'; assert.equal(q.managed(fork), false);
  assert.equal(q.managed(pull('videoq-dependency-bot[bot]', 'runtime/python-next')), false);
  assert.equal(q.managed(pull('videoq-dependency-bot[bot]', 'runtime/python-current')), true);
});
test('all real validation workflows must complete; skipped or missing evidence cannot authorize a queue entry', () => {
  const success = { admitted: true, run: { status: 'completed', conclusion: 'success' } };
  assert.equal(q.result([success, success, success]), 'success');
  for (const row of [{}, { ...success, admitted: false }, { admitted: true, run: { status: 'in_progress' } }]) {
    assert.equal(q.result([success, row, success]), 'waiting');
  }
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
    assert.equal(q.result([success, { admitted: true, run: { status: 'completed', conclusion } }, success]), 'failure');
  }
});
test('actual required job names authorize normal PR CI without an issue lease or admission job', async () => {
  const names = { 'ci.yml': 'CI Success', 'container-validation.yml': 'Container Validation', 'terraform-plan.yml': 'Terraform Plan' };
  const jobs = Object.fromEntries(Object.values(names).map(name => [name, [{ name, conclusion: 'success' }]]));
  const github = { rest: { actions: {
    listWorkflowRuns: async ({ workflow_id }) => ({ data: { workflow_runs: [{ id: names[workflow_id], status: 'completed', conclusion: 'success' }] } }),
    listJobsForWorkflowRun: async ({ run_id }) => jobs[run_id],
  } }, paginate: (method, args) => method(args) };
  const args = { github, context: { repo: { owner: 'videoq-jp', repo: 'videoq' } }, pr: pull() };
  assert.equal(q.result(await q.runs(args)), 'success');
  jobs['CI Success'] = [{ name: 'CI Waiting', conclusion: 'success' }];
  assert.equal(q.result(await q.runs(args)), 'waiting');
  jobs['CI Success'] = [{ name: 'CI Success', conclusion: 'skipped' }];
  assert.equal(q.result(await q.runs(args)), 'waiting');
});
