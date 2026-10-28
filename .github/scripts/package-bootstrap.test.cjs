const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const workflow=readFileSync(join(__dirname,'../workflows/package-bootstrap.yml'),'utf8');
test('namespace bootstrap is manual canonical-main code with a read-only preview before login',()=>{
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/pull_request:|workflow_run:|schedule:/);
  assert.match(workflow,/github.repository == 'videoq-jp\/videoq'.*github.ref == 'refs\/heads\/main'.*github.sha == github.workflow_sha/);
  assert.match(workflow,/ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/publish:[\s\S]*?type: boolean\n        default: false/);
  assert(workflow.indexOf('Verify signatures and preview')<workflow.indexOf('docker login'));
  assert.match(workflow,/if: inputs.publish[\s\S]*?--publish/);
  assert.doesNotMatch(workflow,/docker (?:build |run |push |image rm)|npm (?:ci|run)|pip install|secrets\./);
  assert.match(workflow,/SOURCE_RUN: \$\{\{ steps.source.outputs.run_id \}\}/);
  assert.match(workflow,/ARTIFACT: \$\{\{ steps.source.outputs.artifact \}\}/);
  assert.match(workflow,/docker logout ghcr.io/);
});

test('runner paths are evaluated only inside steps, not the job environment',()=>{
  const jobEnv=workflow.match(/^    env:\n([\s\S]*?)^    steps:/m)[1];
  assert.doesNotMatch(jobEnv,/runner\./);
  assert.equal((workflow.match(/DOCKER_CONFIG: \$\{\{ runner.temp \}\}\/package-bootstrap-docker/g)||[]).length,3);
});

test('single GPU namespace bootstrap is opt-in and passed as a fixed CLI flag',()=>{
  assert.match(workflow,/vllm_only:[\s\S]*?type: boolean\n        default: false/);
  assert.match(workflow,/VLLM_ONLY: \$\{\{ inputs.vllm_only \}\}/);
  assert.equal((workflow.match(/args\+=\(--vllm-only\)/g)||[]).length,2);
  assert.doesNotMatch(workflow,/run:.*\$\{\{ inputs.vllm_only \}\}/);
});
