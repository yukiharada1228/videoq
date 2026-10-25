import assert from 'node:assert/strict';

// Read events while bytes arrive; reading response.text() first cannot measure
// the time a user waits for the first answer character.
export async function readAnswerStream(response, started, now = () => performance.now(), {requireCitations = true} = {}) {
  assert.equal(response.status, 200, 'Streaming answer request failed');
  assert(response.body, 'Streaming answer has no body');
  const decoder = new TextDecoder();
  let pending = '', text = '', firstTextSeconds = null, firstCitationSeconds = null, done = false;
  const sources = [], citations = [];
  function event(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    const value = JSON.parse(data);
    assert(!done, 'Received an event after done');
    assert.notEqual(value.type, 'error', 'Streaming answer reported an error');
    if (value.type === 'text_delta') {
      assert.equal(typeof value.text, 'string');
      if (value.text.trim() && firstTextSeconds === null) firstTextSeconds = (now() - started) / 1000;
      text += value.text;
    } else if (value.type === 'source') sources.push(value.source);
    else if (value.type === 'citation') {
      firstCitationSeconds ??= (now() - started) / 1000;
      citations.push(value);
    } else if (value.type === 'done') done = true;
  }
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, {stream: true});
    // CRLF can itself cross network chunks. Only normalize complete pairs.
    pending = pending.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = pending.indexOf('\n\n')) >= 0) {
      event(pending.slice(0, boundary));
      pending = pending.slice(boundary + 2);
    }
  }
  pending += decoder.decode();
  assert(!pending.trim(), 'Streaming answer ended with an incomplete SSE event');
  assert(done && text.trim() && firstTextSeconds !== null, 'Streaming answer ended without text and done');
  if(requireCitations)assert(citations.length && sources.length, 'Streaming answer has no source/citation');
  for (const citation of citations) assert(sources.some(source => source.id === citation.sourceId), 'Citation references an unknown source');
  return {streamedAnswer: text, sources, citations, firstTextSeconds, firstCitationSeconds, streamSeconds: (now() - started) / 1000};
}

export async function boundedMap(items, concurrency, action) {
  assert(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 8);
  const results = new Array(items.length);
  let next = 0, failure;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {
    for (;;) {
      if (failure) return;
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await action(items[index], index); }
      catch (error) { failure ??= error; return; }
    }
  }));
  if (failure) throw failure;
  return results;
}

export function latencySummary(values) {
  assert(values.length && values.every(v => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return {samples: n, minimum: sorted[0], median: n % 2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2,
    maximum: sorted[n-1], p95: n >= 20 ? sorted[Math.ceil(n*.95)-1] : null,
    interpretation: n >= 20 ? 'Observed samples, not a production SLA' : 'Too few samples for a useful p95 capacity estimate'};
}
