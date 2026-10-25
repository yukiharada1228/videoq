const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {labFetch, closeLabHttp} = require('./http.mjs');

after(closeLabHttp);

test('the lab transport preserves JSON and separate authentication cookies', async () => {
  const server = createServer((_, response) => {
    response.writeHead(200, {'Content-Type':'application/json', 'Set-Cookie':['first=one; Path=/', 'second=two; Path=/']});
    response.end(JSON.stringify({answer:'住所'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await labFetch('http://127.0.0.1:'+server.address().port);
    assert.equal(response.status, 200);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal((await response.json()).answer, '住所');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('the longer CPU transport budget still honors cancellation before headers', async () => {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(labFetch('http://127.0.0.1:'+server.address().port, {signal:AbortSignal.timeout(50)}), {name:'TimeoutError'});
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
