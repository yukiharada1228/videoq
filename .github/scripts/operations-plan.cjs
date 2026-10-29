// Trusted main decides which monitors may access production credentials.
const CHECKS = ['dependencies', 'containers', 'terraform', 'tokens', 'smoke', 'backup', 'onprem', 'inference'];
async function plan({ github, context, check = 'all' }) {
  if (`${context.repo.owner}/${context.repo.repo}` !== 'videoq-jp/videoq' || context.ref !== 'refs/heads/main') {
    throw new Error('Operations require canonical main.');
  }
  let selected;
  switch (context.eventName) {
    case 'schedule':
      if (context.payload.schedule === '17 0 * * *') selected = CHECKS.filter(name => !['backup', 'inference'].includes(name));
      else if (context.payload.schedule === '17 2 * * 1') selected = ['inference'];
      else if (context.payload.schedule === '41 4 1 * *') selected = ['backup'];
      else throw new Error('Unknown operations schedule.');
      break;
    case 'workflow_dispatch':
      if (check !== 'all' && !CHECKS.includes(check)) throw new Error('Unknown operations check.');
      selected = check === 'all' ? CHECKS : [check];
      break;
    case 'push': selected = ['tokens']; break;
    case 'workflow_run': {
      const run = context.payload.workflow_run;
      const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'cd.yml' });
      if (run?.repository?.full_name !== 'videoq-jp/videoq' || run.head_repository?.full_name !== 'videoq-jp/videoq' ||
          run.head_branch !== 'main' || run.workflow_id !== workflow.id || run.conclusion !== 'success') {
        throw new Error('Untrusted CD event.');
      }
      const { data } = await github.rest.actions.listWorkflowRuns({ ...context.repo,
        workflow_id: workflow.id, branch: 'main', status: 'success', per_page: 1 });
      selected = data.workflow_runs[0]?.id === run.id ? ['smoke'] : [];
      break;
    }
    default: throw new Error('Unsupported operations event.');
  }
  return Object.fromEntries(CHECKS.map(name => [name, selected.includes(name)]));
}
module.exports = { plan };
