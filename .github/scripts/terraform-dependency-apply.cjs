// Loaded only from the trusted main revision, without AWS credentials.
const policy = require('./dependency-automation.cjs');
const REPOSITORY = 'videoq-jp/videoq';

function verifiedUpdateTypes(commit) {
  if (commit.author?.login !== 'dependabot[bot]' || !commit.commit?.verification?.verified) return null;
  const block = commit.commit.message.match(/\n---\nupdated-dependencies:\n([\s\S]*?)\n\.\.\.(?:\n|$)/);
  if (!block) return null;
  const dependencies = block[1].match(/^- dependency-name: .+$/gm) || [];
  const types = [...block[1].matchAll(/^  update-type: (.+)$/gm)].map(match => match[1]);
  if (!dependencies.length || dependencies.length !== types.length) return null;
  return types;
}

async function automaticTerraformApply({ github, context }) {
  if (context.eventName !== 'push' || context.ref !== 'refs/heads/main' ||
      `${context.repo.owner}/${context.repo.repo}` !== REPOSITORY ||
      !/^[a-f0-9]{40}$/.test(context.sha)) return false;
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...context.repo, commit_sha: context.sha, per_page: 100,
  });
  const matching = pulls.filter(pr => pr.merged_at && pr.merge_commit_sha === context.sha && pr.base.ref === 'main');
  if (matching.length !== 1) return false;
  const { pr, files, comments } = await policy.getPull({ github, context, number: matching[0].number });
  if (!pr.merged_at || pr.merge_commit_sha !== context.sha ||
      !pr.head.ref.startsWith('dependabot/terraform/') ||
      !policy.eligiblePull(pr, files, 'no-automerge', comments, 'closed')) return false;
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    ...context.repo, pull_number: pr.number, per_page: 100,
  });
  // A human follow-up commit, including a manual merge from main, retains approval.
  if (!commits.length || commits.at(-1).sha !== pr.head.sha) return false;
  const signed = commits.every(commit => {
    const types = verifiedUpdateTypes(commit);
    return types && types.every(updateType => updateType !== 'version-update:semver-major' && policy.autoMergeMetadata({
      ecosystem: 'terraform', updateType, maintainerChanges: 'false',
    }, files));
  });
  if (signed) return true;
  const proof = await require('./dependency-rebase.cjs').provenance({ github, context, pr, files, comments, commits });
  return proof?.metadata.ecosystem === 'terraform' && proof.metadata.updateType !== 'version-update:semver-major';
}

module.exports = { automaticTerraformApply, verifiedUpdateTypes };
