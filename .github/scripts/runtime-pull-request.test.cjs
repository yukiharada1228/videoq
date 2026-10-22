const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate, publish } = require('./runtime-pull-request.cjs');

const plan = () => ({ changed: true, runtime: 'node', channel: 'current', version: '26.12.1', files: { '.node-version': '26.12.1\n' } });
const context = { ref: 'refs/heads/main', sha: 'a'.repeat(40), eventName: 'schedule', repo: { owner: 'yukiharada1228', repo: 'videoq' } };
test('runtime PRs cannot write workflows, application code, credentials, or arbitrary paths', () => {
  for (const path of ['.github/workflows/cd.yml', 'apps/api/src/lib/auth.ts', '.env', '../outside', 'infra/variables.tf']) {
    const candidate = plan(); candidate.files[path] = 'untrusted';
    assert.throws(() => validate(candidate));
  }
  for (const runtime of ['node;echo bad', 'python\nother']) {
    assert.throws(() => validate({ ...plan(), runtime }));
  }
});
test('runtime publication refuses pull requests and other repositories before any API call', async () => {
  for (const invalid of [{ ...context, ref: 'refs/pull/1/merge' }, { ...context, eventName: 'pull_request_target' }, { ...context, repo: { owner: 'someone', repo: 'videoq' } }]) {
    await assert.rejects(publish({ github: {}, context: invalid, plan: plan(), bot: 'runtime-bot[bot]' }));
  }
});
test('a stale main source cannot create a runtime branch', async () => {
  const github = { rest: { git: { getRef: async () => ({ data: { object: { sha: 'b'.repeat(40) } } }) } } };
  await assert.rejects(publish({ github, context, plan: plan(), bot: 'runtime-bot[bot]' }), /Main changed/);
});
test('human edits in an existing runtime PR are preserved', async () => {
  const github = { rest: { git: { getRef: async ({ ref }) => ({ data: { object: { sha: ref === 'heads/main' ? context.sha : 'c'.repeat(40) } } }) },
    pulls: { list: async () => ({ data: [{ number: 1, user: { login: 'runtime-bot[bot]' }, head: { sha: 'c'.repeat(40) } }] }) } },
    paginate: async () => [{ author: { login: 'human' } }] };
  await assert.rejects(publish({ github, context, plan: plan(), bot: 'runtime-bot[bot]' }), /human changes/);
});
test('scheduled runtime updates have no production credentials, PR-triggered execution, or auto-merge', () => {
  const workflow = readFileSync(join(__dirname, '../workflows/runtime-updates.yml'), 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:|id-token: write|environment:|secrets\.(?!PATCH_BOT_PRIVATE_KEY)/);
  assert.match(workflow, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(workflow, /permission-contents: write/);
  assert.doesNotMatch(workflow, /permission-workflows:|--auto|mergePullRequest|enablePullRequestAutoMerge/);
});
test('a new runtime proposal writes an isolated branch and opens a PR without merging', async () => {
  const writes = [];
  const github = { rest: {
    git: {
      getRef: async ({ ref }) => {
        if (ref === 'heads/main') return { data: { object: { sha: context.sha } } };
        throw Object.assign(new Error('not found'), { status: 404 });
      },
      createBlob: async (value) => { writes.push(['blob', value]); return { data: { sha: 'blob' } }; },
      getCommit: async () => ({ data: { tree: { sha: 'base-tree' } } }),
      createTree: async (value) => { writes.push(['tree', value]); return { data: { sha: 'next-tree' } }; },
      createCommit: async (value) => { writes.push(['commit', value]); return { data: { sha: 'new-commit' } }; },
      createRef: async (value) => { writes.push(['ref', value]); },
    },
    pulls: {
      list: async () => ({ data: [] }),
      create: async (value) => { writes.push(['pr', value]); return { data: { number: 123 } }; },
    },
  } };
  assert.equal(await publish({ github, context, core: { info() {} }, plan: plan(), bot: 'runtime-bot[bot]' }), 123);
  assert.equal(writes.find(([kind]) => kind === 'ref')[1].ref, 'refs/heads/runtime/node-current');
  assert.deepEqual(writes.find(([kind]) => kind === 'commit')[1].parents, [context.sha]);
  assert.equal(writes.find(([kind]) => kind === 'pr')[1].base, 'main');
  assert.equal(writes.find(([kind]) => kind === 'pr')[1].head, 'runtime/node-current');
});
