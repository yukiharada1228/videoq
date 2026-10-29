const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('./operations-report.cjs');

function fixture() {
  const f = {
    context: { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main', eventName: 'schedule', runId: 123 },
    core: { summary: { addRaw() { return this; }, async write() {} } },
    kind: 'dependency-security', title: '依存関係の脆弱性',
    report: { status: 'findings', summary: '脆弱性が見つかりました。', details: ['- #1'] },
  };
  f.github = new Proxy({}, { get() { throw new Error('GitHub API must not be used'); } });
  return f;
}

test('findings, errors and recovery write summaries without accessing Issues', async () => {
  const f = fixture();
  const summaries = [];
  f.core.summary.addRaw = function (value) { summaries.push(value); return this; };
  for (const status of ['findings', 'error', 'ok']) {
    f.report.status = status;
    assert.deepEqual(await summarize(f), { healthy: status === 'ok' });
  }
  assert.equal(summaries.length, 3);
  assert.match(summaries[0], /脆弱性が見つかり/);
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
    await assert.rejects(summarize(f));
  }
});
