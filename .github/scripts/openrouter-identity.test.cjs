const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const workflow = readFileSync(resolve(__dirname, '../workflows/openrouter-identity.yml'), 'utf8');

test('identity setup retains the main-only production approval gate', () => {
  assert.match(workflow, /github\.repository == 'videoq-jp\/videoq' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production-infra/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /pull_request_target|contents: write|continue-on-error/);
});
test('setup defaults to inspection and performs no application deployment', () => {
  assert.match(workflow, /default: inspect/);
  assert.match(workflow, /enable\) args\+=\(--enable\)/);
  assert.doesNotMatch(workflow, /terraform apply|wrangler.*deploy|update-function-code|ssm put-parameter/);
});
test('dependencies install before credentials and setup does not export credentials', () => {
  assert.ok(workflow.indexOf('Install AWS SDK') < workflow.indexOf('uses: aws-actions/configure-aws-credentials'));
  assert.doesNotMatch(workflow, /upload-artifact|OPENROUTER_MANAGEMENT_KEY|aws-access-key-id:|aws-secret-access-key:/);
  assert.match(workflow, /persist-credentials: false/);
});
