const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const workflow = readFileSync(join(__dirname,'../workflows/onprem-release.yml'),'utf8');
const job = name => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:|$(?![\\s\\S]))`,'m'))[1];

test('release gates publication on the existing current-main push-CI policy',()=>{
  const source = job('source');
  assert.match(source,/github\.ref == 'refs\/heads\/main'/);
  assert.match(source,/ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(source,/require\('\.\/.github\/scripts\/validate-deployment.cjs'\)/);
  assert.match(workflow,/^permissions:\n  contents: read\n/m);
  for(const name of ['build','chart']) assert.match(job(name),/needs: source/);
});

test('both native architecture builds are credential-free and scan before exporting',()=>{
  const build = job('build');
  assert.match(build,/permissions:\n      contents: read\n    steps:/);
  assert.match(build,/arch: \[amd64, arm64\]/);
  const scan=build.indexOf('uses: aquasecurity/trivy-action@');
  const archive=build.indexOf('docker save');
  assert(scan>=0 && archive>scan);
  assert.match(build,/exit-code: '1'/);
  assert.match(build,/ignore-unfixed: 'false'/);
  assert.doesNotMatch(build,/secrets\.|id-token: write|packages: write|continue-on-error/);
});

test('privileged jobs do not build images or execute application dependencies',()=>{
  for(const name of ['publish','indexes','release']){
    const text=job(name);
    assert.match(text,/id-token: write/);
    assert.doesNotMatch(text,/docker (?:build |run )|npm (?:ci|install|run)|pip install/);
    assert.doesNotMatch(text,/run-id:|github-token:/);
    for(const action of text.matchAll(/uses: actions\/attest@(\S+)/g)) assert.match(action[1],/^[a-f0-9]{40}$/);
    if(text.includes('uses: actions/checkout@')) assert.match(text,/persist-credentials: false/);
  }
  assert.match(job('publish'),/needs: \[source, build\]/);
  assert.match(job('indexes'),/needs: \[source, publish\]/);
  assert.match(job('release'),/needs: \[source, indexes, chart\]/);
});

test('staging verifies signed artifacts before loading or exercising them',()=>{
  const staging=job('staging');
  assert.match(staging,/needs: \[source, release\]/);
  assert.doesNotMatch(staging,/id-token: write|packages: write|secrets\./);
  const verify=staging.indexOf('onprem-release.py verify');
  const pull=staging.indexOf("['docker', 'pull'");
  const exercise=staging.indexOf('onprem-lab.py');
  assert(verify>=0 && pull>verify && exercise>pull);
  assert.match(staging,/--chart "release\/videoq-0.1.0-sha\.\$GITHUB_SHA\.tgz"/);
  assert.match(staging,/docker logout ghcr.io/);
  assert.match(staging,/rm -rf "\$DOCKER_CONFIG"/);
});
