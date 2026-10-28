// Runs only from trusted main, with metadata permissions. Never executes PR code.
const policy = require('./dependency-automation.cjs');
const sync = require('./dependency-rebase.cjs');
const runtime = require('./runtime-pull-request.cjs');
const REPO = 'yukiharada1228/videoq';
const BOT = 'yuki-dependency-patches-20261022[bot]';
const NAME = 'Dependency Queue';
const MARKER = '<!-- videoq-dependency-queue-v1 -->';
const WORKFLOWS = ['ci.yml', 'container-validation.yml', 'terraform-plan.yml'];
const sha = s => /^[a-f0-9]{40}$/.test(s || '');
function managed(pr) {
  return pr.base?.ref === 'main' && pr.head?.repo?.full_name === REPO &&
    (pr.user?.login === 'dependabot[bot]' || (pr.user?.login === BOT && /^runtime\/(node|python|npm|pip|uv)-current$/.test(pr.head.ref)));
}
function parse(comments) {
  const comment = comments.filter(c => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(MARKER + '\n')).at(-1);
  if (!comment) return { state: { entries: {}, failed: {}, retries: {} } };
  const state = JSON.parse(comment.body.split('\n')[1]);
  if (!state.entries || !state.failed || !state.retries) throw new Error('Invalid queue state');
  return { state, comment };
}
async function load({ github, context, issue }) {
  if (!Number.isSafeInteger(issue) || issue < 1) throw new Error('DEPENDENCY_QUEUE_ISSUE is required');
  return parse(await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: issue, per_page: 100 }));
}
// Called by read-only PR workflows. Unknown bot heads wait for classification.
async function admission({ github, context, issue, enabled }) {
  const pr = context.payload.pull_request;
  if (!enabled || !pr || !managed(pr)) return true;
  const { state } = await load({ github, context, issue });
  const row = state.entries[pr.number];
  if (!row || row.sha !== pr.head.sha) return false;
  if (row.mode === 'bypass') return true;
  const { data: main } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  return state.active === pr.number && row.mode === 'active' && row.base === main.commit.sha;
}
async function verified({ github, context, pr }) {
  const pull = await policy.getPull({ github, context, number: pr.number });
  const commits = await github.paginate(github.rest.pulls.listCommits, { ...context.repo, pull_number: pr.number, per_page: 100 });
  if (!commits.length || commits.at(-1).sha !== pull.pr.head.sha) return null;
  if (pr.user.login === BOT) {
    if (process.env.RUNTIME_AUTOMERGE_ENABLED === 'false' || !runtime.eligible(pull.pr, pull.files, pull.comments, BOT) || commits.some(c => c.author?.login !== BOT)) return null;
    return { ...pull, kind: 'runtime', runtime: pr.head.ref.split('/')[1].replace('-current', '') };
  }
  const sourceFile = require('./claude-dependency-repair.cjs').sourceFile;
  if (pull.pr.labels.some(l => l.name === 'no-rebase') || !policy.eligiblePull(pull.pr, pull.files.filter(f => !sourceFile(f.filename)), 'no-automerge', pull.comments)) return null;
  const proof = await sync.provenance({ github, context, ...pull, commits });
  if (!proof) return null;
  const original = proof.originalCommits || commits;
  const seedHead = policy.verifiedDependencyCommits(original, proof.originalHead) ? proof.originalHead : undefined;
  return { ...pull, kind: 'dependabot', ...proof, seedHead };
}
async function checkpoint({ github, context, pr, status, summary, base }) {
  const checks = await github.paginate(github.rest.checks.listForRef, { ...context.repo, ref: pr.head.sha, check_name: NAME, per_page: 100 });
  const previous = checks.filter(c => c.app?.id === 15368 && c.name === NAME).sort((a, b) => b.id - a.id)[0];
  const conclusion = ['success', 'failure'].includes(status) ? status : undefined;
  const desired = conclusion ? 'completed' : status;
  const external_id = JSON.stringify({ number: pr.number, base });
  if (previous?.status === desired && previous?.conclusion === (conclusion || null) && previous?.external_id === external_id && previous?.output?.summary === summary) return;
  const fields = { ...context.repo, status: desired, ...(conclusion ? { conclusion, completed_at: new Date().toISOString() } : {}),
    external_id, output: { title: NAME, summary } };
  // Completed checks are immutable queue decisions; create a fresh pending gate
  // if a previously tested head needs validation against a new main.
  if (previous && previous.status !== 'completed') await github.rest.checks.update({ ...fields, check_run_id: previous.id });
  else await github.rest.checks.create({ ...fields, name: NAME, head_sha: pr.head.sha });
}
async function runs({ github, context, pr }, allowLegacy = false) {
  return Promise.all(WORKFLOWS.map(async workflow_id => {
    const { data } = await github.rest.actions.listWorkflowRuns({ ...context.repo, workflow_id, head_sha: pr.head.sha, event: 'pull_request', per_page: 100 });
    const run = data.workflow_runs.sort((a, b) => b.id - a.id)[0];
    if (!run) return { workflow_id };
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...context.repo, run_id: run.id, filter: 'latest', per_page: 100 });
    const hasAdmission = jobs.some(policy.admissionJob);
    const admitted = workflow_id === 'terraform-plan.yml' || policy.admittedCI(jobs) ||
      (allowLegacy && !hasAdmission && jobs.length > 0);
    return { workflow_id, run, admitted };
  }));
}
function result(rows) {
  if (rows.some(r => r.admitted && r.run?.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required'].includes(r.run.conclusion))) return 'failure';
  if (rows.every(r => r.admitted && r.run?.status === 'completed' && r.run.conclusion === 'success')) return 'success';
  return 'waiting';
}
function requireQueueProtection(protection) {
  policy.requireProtection(protection);
  const checks = protection.required_status_checks.checks;
  if ([NAME, 'Terraform Plan', 'Container Validation'].some(name =>
    !checks.some(check => check.context === name && check.app_id === 15368))) {
    throw new Error('Dependency automation requires the queue and all validation checks on protected main');
  }
}
async function reconcile({ github, writerGithub, context, issue, retry = 0, saveSummary = async () => {}, verify = verified,
  repairEnabled = false, authorizeRepair = false, prepareRepair = repairFailure,
  reserve = async () => { throw new Error('Merge reservation callback required'); } }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== REPO || context.ref !== 'refs/heads/main') throw new Error('Queue requires trusted main');
  const { data: protection } = await writerGithub.rest.repos.getBranchProtection({ ...context.repo, branch: 'main' });
  requireQueueProtection(protection);
  const loaded = await load({ github, context, issue });
  const state = loaded.state;
  if (retry) {
    delete state.failed[retry];
    if (state.refresh) delete state.refresh[retry];
    state.retryRequested ||= {};
    state.retryRequested[retry] = true;
  }
  const { data: main } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  const base = main.commit.sha;
  if (!sha(base)) throw new Error('Invalid main SHA');
  const pulls = await github.paginate(github.rest.pulls.list, { ...context.repo, state: 'open', base: 'main', sort: 'created', direction: 'asc', per_page: 100 });
  const candidates = [];
  const entries = {};
  for (const listed of pulls) {
    if (!managed(listed)) {
      await checkpoint({ github, context, pr: listed, status: 'success', summary: '通常の開発PRです。既存の必須CIとレビューが必要です。', base });
      continue;
    }
    const c = await verify({ github, context, pr: listed });
    const pr = c?.pr || (await github.rest.pulls.get({ ...context.repo, pull_number: listed.number })).data;
    if (!c) {
      entries[pr.number] = { sha: pr.head.sha, mode: 'bypass' };
      if (pr.auto_merge) await writerGithub.graphql('mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}', { id: pr.node_id });
      const status = result(await runs({ github, context, pr }, true));
      await checkpoint({ github, context, pr, status: status === 'waiting' ? 'queued' : status,
        summary: '自動マージ対象外です。実際の通常CI・手動レビューに回します。', base });
      continue;
    }
    entries[pr.number] = { sha: pr.head.sha, mode: 'waiting', base };
    candidates.push(c);
  }
  let active = candidates.find(c => c.pr.number === state.active && state.failed[c.pr.number] !== c.pr.head.sha);
  if (!active) active = candidates.find(c => state.failed[c.pr.number] !== c.pr.head.sha);
  state.entries = entries;
  state.active = active?.pr.number || null;
  let outcome = 'waiting';
  let activeRuns = [];
  let behind = false;
  if (active) {
    if (active.seedHead) await require('./claude-dependency-repair.cjs').seed({ github, context,
      pr: { ...active.pr, head: { ...active.pr.head, sha: active.seedHead } }, metadata: active.metadata });
    const { data: comparison } = await github.rest.repos.compareCommits({ ...context.repo, base, head: active.pr.head.sha });
    behind = comparison.behind_by > 0;
    if (!behind) {
      entries[active.pr.number].mode = 'active';
      activeRuns = await runs({ github, context, pr: active.pr });
      if (state.retryRequested?.[active.pr.number]) {
        activeRuns = activeRuns.map(row => row.run?.status === 'completed' && row.run.conclusion !== 'success'
          ? { ...row, admitted: false } : row);
      }
      outcome = result(activeRuns);
      if (outcome === 'failure') {
        state.failed[active.pr.number] = active.pr.head.sha;
        entries[active.pr.number].mode = 'failed';
        state.active = null;
      }
    }
  }
  for (const c of candidates) {
    const pr = c.pr;
    const failed = state.failed[pr.number] === pr.head.sha;
    const isActive = state.active === pr.number;
    const status = failed ? 'failure' : isActive ? (outcome === 'success' ? 'success' : 'in_progress') : 'queued';
    const summary = failed ? 'CI失敗。修正コミットを待ち、次のPRを進めます。' : isActive ? `順番が来ました。main ${base} に追従し、実際に実行したCIの成功を待ちます。` : '順番待ちです。重いCIは開始しません。';
    await checkpoint({ github, context, pr, status, summary, base });
  }
  async function save() {
    const text = `実行中: ${state.active ? '#' + state.active : 'なし'}\n\n` + Object.entries(entries).map(([n, row]) => `- #${n}: ${state.failed[n] === row.sha ? 'failed' : row.mode}`).join('\n');
    const body = `${MARKER}\n${JSON.stringify(state)}\n\n${text}`;
    if (loaded.comment) await github.rest.issues.updateComment({ ...context.repo, comment_id: loaded.comment.id, body });
    else {
      const { data } = await github.rest.issues.createComment({ ...context.repo, issue_number: issue, body });
      loaded.comment = data;
    }
    await saveSummary(text);
  }
  // Publish the lease before rerunning read-only CI. Missing leases fail closed.
  await save();
  if (active && outcome !== 'failure') {
    if (behind) {
      try {
        if (active.kind === 'runtime') {
          state.refresh ||= {};
          const key = `${active.pr.head.sha}:${base}`;
          const previous = state.refresh[active.pr.number];
          if (previous?.key === key) {
            const { data } = await github.rest.actions.listWorkflowRuns({ ...context.repo, workflow_id: 'runtime-updates.yml', event: 'workflow_dispatch', per_page: 100 });
            const pending = data.workflow_runs.filter(r => Date.parse(r.created_at) >= Date.parse(previous.at) - 1000);
            if (pending.length && pending.every(r => r.status === 'completed')) throw new Error('Runtime regeneration finished without updating this PR');
          } else {
            state.refresh[active.pr.number] = { key, at: new Date().toISOString() };
            await save();
            await github.rest.actions.createWorkflowDispatch({ ...context.repo, workflow_id: 'runtime-updates.yml', ref: 'main', inputs: { dry_run: 'false', runtime: active.runtime, channel: 'current' } });
          }
        }
        else {
          const updated = await sync.update({ github, writerGithub, context, number: active.pr.number, expectedSha: active.pr.head.sha });
          if (!updated) throw new Error('PR changed or could not be safely synchronized');
        }
      } catch (error) {
        state.failed[active.pr.number] = active.pr.head.sha;
        state.active = null;
        outcome = 'failure';
        await checkpoint({ github, context, pr: active.pr, status: 'failure', base,
          summary: `main追従を完了できませんでした。次のPRを進めます。${String(error.message).slice(0, 500)}` });
        await save();
      }
    } else {
      for (const row of activeRuns) {
        if (!row.run || row.run.status !== 'completed' || row.admitted) continue;
        const key = `${row.run.id}:${row.run.run_attempt}`;
        if (state.retries[row.workflow_id] === key) continue;
        state.retries[row.workflow_id] = key;
        await save();
        await github.rest.actions.reRunWorkflow({ ...context.repo, run_id: row.run.id });
      }
      if (outcome === 'success') {
        const { data: current } = await github.rest.pulls.get({ ...context.repo, pull_number: active.pr.number });
        const { data: currentMain } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
        if (current.head.sha === active.pr.head.sha && currentMain.commit.sha === base && !current.auto_merge &&
            !current.labels.some(l => ['no-automerge', 'no-runtime-update', 'no-rebase'].includes(l.name))) {
          await reserve({ number: current.number, sha: current.head.sha });
        }
      }
    }
  }
  // Bypassed bot proposals may have initially deferred before classification.
  for (const pr of pulls.filter(p => entries[p.number]?.mode === 'bypass')) {
    for (const row of await runs({ github, context, pr }, true)) {
      if (!row.run || row.run.status !== 'completed' || row.admitted) continue;
      const key = `${row.run.id}:${row.run.run_attempt}`;
      if (state.retries[`bypass-${row.run.id}`] === key) continue;
      state.retries[`bypass-${row.run.id}`] = key;
      await save();
      await github.rest.actions.reRunWorkflow({ ...context.repo, run_id: row.run.id });
    }
  }
  let repairWake = false;
  if (repairEnabled) {
    const repair = require('./claude-dependency-repair.cjs');
    for (const c of candidates) {
      if (c.kind !== 'dependabot' || state.failed[c.pr.number] !== c.pr.head.sha) continue;
      const comments = c.comments || [];
      if (repair.records(comments, 'attempt').some(r => r.sha === c.pr.head.sha) ||
          repair.records(comments, 'security-stop').some(r => r.sha === c.pr.head.sha) ||
          repair.records(comments, 'stopped').length) continue;
      const rows = c === active ? activeRuns : await runs({ github, context, pr: c.pr });
      const ci = rows.find(row => row.workflow_id === 'ci.yml');
      if (!ci?.admitted || ci.run?.status !== 'completed' || ci.run.conclusion !== 'failure') continue;
      if (authorizeRepair) await prepareRepair({ github, writerGithub, context, runId: ci.run.id });
      else repairWake = true;
    }
  }
  if ((active && outcome === 'failure') || repairWake) {
    // workflow_dispatch is an explicit wake-up after releasing a failed slot.
    await github.rest.actions.createWorkflowDispatch({ ...context.repo, workflow_id: 'dependency-queue.yml', ref: 'main' });
  }
  if (active && state.retryRequested?.[active.pr.number]) {
    delete state.retryRequested[active.pr.number];
    await save();
  }
  return { active: state.active, outcome };
}
// Only a main push, workflow_run or explicit main dispatch may authorize a worker.
// The worker independently checks the real controller run, current SHA and limits.
async function repairFailure({ github, writerGithub, context, runId }) {
  const repair = require('./claude-dependency-repair.cjs');
  const c = await repair.scope({ github, writerGithub, context, runId });
  if (!c) return null;
  try {
    await github.rest.actions.createWorkflowDispatch({ ...context.repo, workflow_id: 'claude-dependency-worker.yml', ref: 'main',
      inputs: { number: String(c.number), sha: c.sha, run_id: String(runId), authorization_run: String(context.runId) } });
  } catch (error) {
    await github.rest.issues.createComment({ ...context.repo, issue_number: c.number,
      body: `Claude修正ジョブを起動できませんでした。実行ログ: https://github.com/${REPO}/actions/runs/${context.runId}` });
    throw error;
  }
  return c;
}
module.exports = { managed, parse, admission, verified, checkpoint, result, requireQueueProtection, reconcile, repairFailure, NAME, MARKER };
