const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { validate, publish, eligible, sameLine, scope } = require('./runtime-pull-request.cjs');

const plan = () => ({ changed: true, runtime: 'node', channel: 'current', previous_version: '26.12.0', version: '26.12.1', files: { '.node-version': '26.12.1\n' } });
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
test('runtime discovery never executes PR code or receives production credentials', () => {
  const workflow = readFileSync(join(__dirname, '../workflows/runtime-updates.yml'), 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:|id-token: write|environment:|secrets\.(?!PATCH_BOT_PRIVATE_KEY)/);
  assert.match(workflow, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(workflow, /permission-contents: write/);
  assert.doesNotMatch(workflow, /permission-workflows:/);
  const guard = readFileSync(join(__dirname, '../workflows/runtime-automerge.yml'), 'utf8');
  assert.match(guard, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.doesNotMatch(guard, /ref:.*head|npm ci|pip install|runtime-versions.py plan/);
});
function publicationFixture() {
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
    issues: { createComment: async value => writes.push(['receipt', value]) },
  } };
  return { github, writes };
}
test('a new runtime proposal writes an isolated branch and opens a PR without merging', async () => {
  const { github, writes } = publicationFixture();
  assert.equal(await publish({ github, context, core: { info() {} }, plan: plan(), bot: 'runtime-bot[bot]' }), 123);
  assert.equal(writes.find(([kind]) => kind === 'ref')[1].ref, 'refs/heads/runtime/node-current');
  assert.deepEqual(writes.find(([kind]) => kind === 'commit')[1].parents, [context.sha]);
  assert.equal(writes.find(([kind]) => kind === 'pr')[1].base, 'main');
  assert.equal(writes.find(([kind]) => kind === 'pr')[1].head, 'runtime/node-current');
  assert.match(writes.find(([kind]) => kind === 'receipt')[1].body, /videoq-runtime-update-v1/);
});
test('only current-line publications reserve a merge and only after recording the exact head', async () => {
  const current = publicationFixture();
  await publish({ ...current, context, core: { info() {} }, plan: plan(), bot: 'runtime-bot[bot]', autoMergeCurrent: true,
    queue: async c => { assert.ok(current.writes.some(([kind]) => kind === 'receipt')); current.writes.push(['queue', c]); } });
  assert.deepEqual(current.writes.find(([kind]) => kind === 'queue')[1], { number: 123, sha: 'new-commit' });
  const next = publicationFixture();
  await publish({ ...next, context, core: { info() {} }, plan: { ...plan(), channel: 'next', version: '28.0.0' }, bot: 'runtime-bot[bot]', autoMergeCurrent: true,
    queue: async () => { throw new Error('New release lines must not auto-merge'); } });
  assert.throws(() => validate({ ...plan(), version: '28.0.0' }), /Invalid/);
});

test('all generated on-prem pins can be published together', () => {
  assert.doesNotThrow(() => validate({ ...plan(), files: {
    '.github/runtime-versions.json': '{}', 'apps/api/Dockerfile': 'FROM node',
    'apps/worker/Dockerfile.onprem': 'FROM python',
  } }));
});
test('automatic runtime merges exclude new series, downgrades, missing metadata and untrusted edits', () => {
  for (const [runtime, before, after, expected] of [
    ['node', '26.12.1', '26.13.0', true], ['node', '26.12.1', '28.0.0', false],
    ['python', '3.14.9', '3.14.10', true], ['python', '3.14.9', '3.15.0', false],
    ['uv', '0.13.5', '0.13.6', true], ['uv', '0.13.5', '0.14.0', false],
    ['npm', '12.2.1', '12.2.1', true], ['pip', '26.2.2', '26.2.1', false],
  ]) assert.equal(sameLine({ runtime, previous_version: before, version: after }), expected);
  const bot = 'runtime-bot[bot]', A = 'a'.repeat(40), B = 'b'.repeat(40);
  const pr = { state: 'open', draft: false, user: { login: bot }, labels: [],
    base: { ref: 'main', repo: { full_name: 'yukiharada1228/videoq' } },
    head: { ref: 'runtime/node-current', sha: A, repo: { full_name: 'yukiharada1228/videoq' } } };
  const receipt = { user: { login: bot }, body: '<!-- videoq-runtime-update-v1 -->\n' + JSON.stringify({ ...plan(), sha: A, base: B }) };
  const files = [{ filename: '.node-version', status: 'modified' }];
  assert.equal(eligible(pr, files, [receipt], bot), true);
  assert.equal(eligible(pr, files, [{ ...receipt, user: { login: 'human' } }], bot), false);
  assert.equal(eligible({ ...pr, head: { ...pr.head, sha: B } }, files, [receipt], bot), false);
  assert.equal(eligible({ ...pr, labels: [{ name: 'no-automerge' }] }, files, [receipt], bot), false);
  assert.equal(eligible(pr, [...files, { filename: '.github/workflows/cd.yml', status: 'modified' }], [receipt], bot), false);
  assert.equal(eligible({ ...pr, head: { ...pr.head, ref: 'runtime/node-next' } }, files, [receipt], bot), false);
});
test('repository events refresh only existing current-line PRs behind main', async () => {
  const pr = { user: { type: 'Bot' }, draft: false, labels: [], head: { ref: 'runtime/uv-current', sha: 'c'.repeat(40), repo: { full_name: 'yukiharada1228/videoq' } } };
  const github = { paginate: async () => [pr, { ...pr, head: { ...pr.head, ref: 'runtime/python-next' } }],
    rest: { pulls: { list() {} }, repos: { compareCommits: async () => ({ data: { ahead_by: 1 } }) } } };
  assert.deepEqual((await scope({ github, context: { ...context, eventName: 'push' } })).matrix.include, [{ runtime: 'uv', channel: 'current' }]);
  github.rest.repos.compareCommits = async () => ({ data: { ahead_by: 0 } });
  assert.equal((await scope({ github, context: { ...context, eventName: 'workflow_run' } })).active, false);
  assert.equal((await scope({ github: {}, context })).matrix.include.length, 10);
  assert.deepEqual((await scope({ github: {}, context: { ...context, eventName: 'workflow_dispatch' }, runtime: 'uv' })).matrix.include, [{ runtime: 'uv', channel: 'current' }]);
});

test('unchanged managed proposals still reserve merges, while superseded or opted-out proposals do not', async () => {
  function managedFixture() {
    const f = publicationFixture(), old = 'c'.repeat(40), bot = 'runtime-bot[bot]';
    f.pr = { number: 123, node_id: 'PR_123', user: { login: bot }, head: { sha: old }, labels: [], auto_merge: null };
    f.github.rest.git.getRef = async ({ ref }) => ({ data: { object: { sha: ref === 'heads/main' ? context.sha : old } } });
    f.github.rest.pulls.list = async () => ({ data: [f.pr] });
    f.github.rest.pulls.listCommits = async () => [{ author: { login: bot } }];
    f.github.rest.issues.listComments = async () => [{ user: { login: bot }, body: '<!-- videoq-runtime-update-v1 -->\n' + JSON.stringify({ ...plan(), sha: old }) }];
    f.github.paginate = (fn, args) => fn(args);
    f.github.rest.repos = { compareCommits: async () => ({ data: { ahead_by: 0 } }),
      getContent: async () => ({ data: { content: Buffer.from('26.12.1\n').toString('base64') } }) };
    f.github.rest.pulls.update = async a => { f.writes.push(['update', a]); return { data: f.pr }; };
    f.github.graphql = async () => f.writes.push(['disable']);
    f.args = { github: f.github, context, core: { info() {} }, plan: plan(), bot, autoMergeCurrent: true,
      queue: async a => f.writes.push(['queue', a]) };
    return f;
  }
  const same = managedFixture();
  await publish(same.args);
  assert.deepEqual(same.writes, [['queue', { number: 123, sha: 'c'.repeat(40) }]]);
  const applied = managedFixture();
  await publish({ ...applied.args, plan: { ...plan(), changed: false, files: {} } });
  assert.equal(applied.writes[0][1].state, 'closed');
  const opted = managedFixture(); opted.pr.labels.push({ name: 'no-runtime-update' }); opted.pr.auto_merge = {};
  await publish(opted.args);
  assert.deepEqual(opted.writes, [['disable']]);
  const modified = managedFixture(); modified.github.rest.issues.listComments = async () => [];
  await assert.rejects(publish(modified.args), /no trusted publication receipt/);
  assert.deepEqual(modified.writes, []);
});
