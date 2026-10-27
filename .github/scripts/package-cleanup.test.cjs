const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const workflow=readFileSync(join(__dirname,'../workflows/package-cleanup.yml'),'utf8');
test('retired package deletion is manual and restricted to canonical main code',()=>{
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/pull_request:|workflow_run:|schedule:|\n  push:/);
  assert.match(workflow,/github.repository == 'yukiharada1228\/videoq'.*github.ref == 'refs\/heads\/main'.*github.sha == github.workflow_sha/);
  assert.match(workflow,/ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/delete:[\s\S]*?type: boolean\n        default: false/);
  assert.match(workflow,/if: inputs.delete[\s\S]*?--delete/);
  assert(workflow.indexOf('Verify signatures and preview')<workflow.indexOf('Delete only'));
  assert.match(workflow,/group: onprem-release/);
  assert.doesNotMatch(workflow,/secrets\.|docker (?:build|run|push)|\$\{\{ inputs\.[^}]+\}\}.*--delete/);
});
