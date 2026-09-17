// Loaded from github.workflow_sha, never from the proposed deployment commit.
// No production secrets or OIDC permissions are available to this job.
const REPOSITORY = 'yukiharada1228/videoq';

function checkRun(run, { sha, workflowId }) {
  if (
    run.event !== 'push' ||
    run.head_branch !== 'main' ||
    run.repository?.full_name !== REPOSITORY ||
    run.head_repository?.full_name !== REPOSITORY ||
    run.workflow_id !== workflowId ||
    run.head_sha !== sha ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    throw new Error('Deployment requires successful push CI for the current main commit in the source repository.');
  }
}

module.exports = async function validateDeployment({ github, context }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== REPOSITORY || context.ref !== 'refs/heads/main') {
    throw new Error('Production deployments are restricted to the source repository main branch.');
  }
  if (!['workflow_run', 'workflow_dispatch'].includes(context.eventName)) {
    throw new Error('Unsupported deployment event.');
  }

  // Reject untrusted events before doing anything with their SHA or run ID.
  const trigger = context.payload.workflow_run;
  if (context.eventName === 'workflow_run' && (
    !trigger || trigger.event !== 'push' || trigger.head_branch !== 'main' ||
    trigger.repository?.full_name !== REPOSITORY ||
    trigger.head_repository?.full_name !== REPOSITORY ||
    trigger.conclusion !== 'success'
  )) {
    throw new Error('Only successful CI triggered by a push to the source repository main branch may deploy.');
  }

  const { data: branch } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  const sha = branch.commit.sha;
  const requestedSha = trigger?.head_sha ?? context.sha;
  if (!/^[a-f0-9]{40}$/.test(sha) || requestedSha !== sha) {
    throw new Error('Refusing a stale deployment: the requested commit is not the current main commit.');
  }

  const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'ci.yml' });
  let runId = trigger?.id;
  if (context.eventName === 'workflow_dispatch') {
    const { data } = await github.rest.actions.listWorkflowRuns({
      ...context.repo, workflow_id: workflow.id, branch: 'main', event: 'push', head_sha: sha, per_page: 100,
    });
    // Do not fall back to an older success when a newer run is failing/running.
    const latest = [...data.workflow_runs].sort((a, b) => b.id - a.id)[0];
    if (!latest) throw new Error('No push CI run exists for the current main commit.');
    runId = latest.id;
  }

  const { data: run } = await github.rest.actions.getWorkflowRun({ ...context.repo, run_id: runId });
  checkRun(run, { sha, workflowId: workflow.id });
  if (trigger && run.run_attempt !== trigger.run_attempt) {
    throw new Error('The triggering CI attempt has been superseded; wait for the latest attempt.');
  }
  return sha;
};
