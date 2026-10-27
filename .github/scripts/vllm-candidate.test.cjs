const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');
const workflow=readFileSync(join(__dirname,'../workflows/onprem-validation.yml'),'utf8');
const start=workflow.indexOf('const vllm = parse(');
const end=workflow.indexOf('\n          JS',start);
const resolver=workflow.slice(start,end);
function resolve(accelerator,candidate='') {
  const lines=[];
  const image={repository:'vllm/vllm-openai',digest:'sha256:'+'a'.repeat(64)};
  const rocmImage={repository:'vllm/vllm-openai-rocm',digest:'sha256:'+'b'.repeat(64)};
  runInNewContext(resolver,{
    readFileSync:()=>'', parse:()=>({vllm:{image,rocmImage}}),
    appendFileSync:(_path,line)=>lines.push(line),
    process:{env:{ACCELERATOR:accelerator,NVIDIA_CANDIDATE:accelerator==='nvidia'?candidate:'',AMD_CANDIDATE:accelerator==='amd'?candidate:''}}
  });
  return lines.filter(line=>line.startsWith('VLLM_IMAGE=')).join('');
}
test('no candidate means use the reviewed chart pin',()=>{
  assert.equal(resolve('nvidia'),'VLLM_IMAGE=vllm/vllm-openai@sha256:'+'a'.repeat(64)+'\n');
  assert.equal(resolve('amd'),'VLLM_IMAGE=vllm/vllm-openai-rocm@sha256:'+'b'.repeat(64)+'\n');
});
test('manual candidates accept only each vendor official repository and exact digest',()=>{
  for(const [vendor,repo] of [['nvidia','vllm/vllm-openai'],['amd','vllm/vllm-openai-rocm']]) {
    const ref=repo+'@sha256:'+'c'.repeat(64);
    assert.equal(resolve(vendor,ref),'VLLM_IMAGE='+ref+'\n');
    for(const bad of ['other/image@sha256:'+'c'.repeat(64),repo+':nightly',ref+'\nINJECTED=yes',repo+'@sha256:123']) {
      assert.throws(()=>resolve(vendor,bad),/exact official upstream/);
    }
  }
  assert.throws(()=>resolve('amd','vllm/vllm-openai@sha256:'+'c'.repeat(64)),/exact official upstream/);
});
test('candidate evidence retains immutable identity and full vulnerability gates',()=>{
  assert.match(workflow,/NVIDIA_CANDIDATE: \$\{\{ inputs.nvidia_candidate \}\}/);
  assert.match(workflow,/AMD_CANDIDATE: \$\{\{ inputs.amd_candidate \}\}/);
  assert.match(workflow,/Bind scan evidence to the exact requested image/);
  assert.match(workflow,/reference not in report.get\('Metadata', \{\}\).get\('RepoDigests', \[\]\)/);
  assert.match(workflow,/severity: HIGH,CRITICAL\n          ignore-unfixed: 'false'\n          exit-code: '1'/);
  assert.doesNotMatch(workflow,/\$\{\{ inputs\.(?:nvidia|amd)_candidate \}\}.*docker/);
});

test('vendor evaluation is limited to NVIDIA NGC and does not reuse the upstream header assessment',()=>{
  const ref='nvcr.io/nvidia/vllm@sha256:'+'d'.repeat(64);
  assert.equal(resolve('nvidia',ref),'VLLM_IMAGE='+ref+'\n');
  assert.throws(()=>resolve('amd',ref),/exact official upstream/);
  assert.throws(()=>resolve('nvidia','nvcr.io/other/image@sha256:'+'d'.repeat(64)),/exact official upstream/);
  assert.match(workflow,/ASSESS_NVIDIA_HEADERS=\$\{reference.startsWith\('vllm\/vllm-openai@'\)\}/);
  assert.match(workflow,/trivy-config:.*env.ASSESS_NVIDIA_HEADERS == 'true'/);
});
test('candidate-only mode skips non-GPU suites while normal CI keeps them',()=>{
  assert.equal((workflow.match(/gpu_candidates_only:\n        type: boolean\n        default: false/g)||[]).length,2);
  assert.match(workflow,/onprem:\n    if: \$\{\{ !inputs.gpu_candidates_only \}\}/);
  assert.match(workflow,/upstream-cpu-images:\n    if: \$\{\{ !inputs.gpu_candidates_only \}\}/);
});
