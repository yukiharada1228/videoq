const { test } = require('node:test');
const assert = require('node:assert/strict');
const { notify } = require('./operations-notify.cjs');
const { inspect } = require('./dependency-stalls.cjs');

function fixture() {
  const f = {
    context: { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main', eventName: 'schedule', runId: 123 },
    core: { summary: { addRaw() { return this; }, async write() {} } },
    kind: 'dependency-stalls', title: '依存関係更新PRの滞留',
    report: { status: 'findings', summary: '更新が滞留しています。', details: ['- #1'] },
    issues: [], mutations: [], pulls: [], runs: [],
  };
  f.github = { rest: {
    issues: {
      listForRepo: async () => f.issues,
      create: async args => {
        f.mutations.push(['create', args]);
        const issue = { ...args, number: f.issues.length + 1, state: 'open', user: { login: 'github-actions[bot]' }, labels: [] };
        f.issues.push(issue); return { data: issue };
      },
      update: async args => {
        f.mutations.push(['update', args]);
        Object.assign(f.issues.find(issue => issue.number === args.issue_number), args);
      },
    },
    pulls: { list: async () => f.pulls, get: async () => ({ data: f.pulls[0] }) },
    repos: { getCommit: async () => ({ data: { commit: { committer: { date: '2026-10-01T00:00:00Z' } } } }) },
    actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: f.runs } }) },
  }, paginate: (method, args) => method(args) };
  return f;
}

test('findings, errors and recovery write summaries without accessing Issues', async () => {
  const f = fixture();
  const summaries = [];
  f.core.summary.addRaw = function (value) { summaries.push(value); return this; };
  f.github = new Proxy({}, { get() { throw new Error('GitHub API must not be used'); } });
  for (const status of ['findings', 'error', 'ok']) {
    f.report.status = status;
    assert.deepEqual(await notify(f), { healthy: status === 'ok' });
  }
  assert.equal(summaries.length, 3);
  assert.match(summaries[0], /更新が滞留/);
  assert.match(summaries[0], /#1/);
});

test('PR refs, forks, unknown reports and malformed reports cannot create notifications', async () => {
  for (const change of [
    f => { f.context.ref = 'refs/pull/1/merge'; },
    f => { f.context.repo.owner = 'fork'; },
    f => { f.context.eventName = 'pull_request'; },
    f => { f.kind = 'arbitrary'; },
    f => { f.report = { status: 'ok' }; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(notify(f));
    assert.equal(f.mutations.length, 0);
  }
});

test('staleness uses the current head and latest CI without mutating pull requests', async () => {
  const f = fixture();
  f.pulls = [{
    number: 1, state: 'open', draft: false, labels: [], user: { login: 'dependabot[bot]' },
    created_at: '2026-10-01T00:00:00Z',
    head: { sha: 'a'.repeat(40), repo: { full_name: 'videoq-jp/videoq' } },
    mergeable_state: 'behind',
  }];
  f.now = new Date('2026-10-22T00:00:00Z');
  const report = await inspect(f);
  assert.equal(report.status, 'findings');
  assert.match(report.details[0], /最新main/);
  f.github.rest.repos.getCommit = async () => ({ data: { commit: { committer: { date: f.now.toISOString() } } } });
  assert.equal((await inspect(f)).status, 'ok');
  assert.equal(f.mutations.length, 0);
});
