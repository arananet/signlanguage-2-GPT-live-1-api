import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import express from 'express';
import { createApi } from '../server/api.mjs';

async function fixture(context, fetchImpl, apiKey = 'test-server-secret') {
  const app = express();
  const origin = 'http://localhost:3100';
  app.use('/api', createApi({ apiKey, origin, fetchImpl }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(() => { server.closeAllConnections(); server.close(); });
  return (path, body, headers = {}) => new Promise((resolve, reject) => {
    const request = httpRequest(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method: 'POST', headers: { origin, host: 'localhost:3100', 'Content-Type': 'application/json', ...headers },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}
const frames = Array.from({ length: 4 }, (_, index) => ({ image: 'data:image/jpeg;base64,/9j/AA==', timeMs: index * 500 }));

test('ordered consented frames use Responses, abstain, and keep the key server-side', async context => {
  const request = await fixture(context, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-server-secret');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.input[0].content[2].text, 'Frame at 500 ms');
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ transcript: 'guess', uncertain: true, note: 'Unclear motion' }) }] }] });
  });
  const response = await request('interpret', { consent: true, frames });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { transcript: '', uncertain: true, note: 'Unclear motion' });
});

test('rejects missing consent, excess or unordered frames, and hostile origins', async context => {
  const request = await fixture(context, () => assert.fail('must not call OpenAI'));
  for (const body of [{ consent: false, frames }, { consent: true, frames: [...frames].reverse() }, { consent: true, frames: Array(13).fill(frames[0]) }]) {
    assert.equal((await request('interpret', body)).status, 400);
  }
  assert.equal((await request('session', { sdp: 'v=0\r\no=demo' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('session', { sdp: 'v=0\r\no=demo' }, { host: 'evil.test' })).status, 403);
});

test('Live session uses its own endpoint and only returns allowlisted fields', async context => {
  const request = await fixture(context, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/live/sessions');
    const body = JSON.parse(options.body);
    assert.equal(body.session.model, 'gpt-live-1');
    assert.equal(body.session.store, false);
    assert.equal(body.session.delegation.type, 'client');
    assert.match(body.session.instructions, /not a conversation partner/);
    assert.match(body.session.instructions, /source text verbatim, once/);
    assert.match(body.session.instructions, /Example source: Thank you\. Exact speech: Thank you\./);
    assert.match(body.session.instructions, /Silence is not a request to continue/);
    assert.doesNotMatch(body.session.instructions, /as closely as possible/);
    assert.equal(body.transport.type, 'webrtc');
    return Response.json({ session: { id: 'live_test', secret: 'hidden' }, transport: { sdp: 'answer' }, key: 'hidden' });
  });
  const response = await request('session', { sdp: 'v=0\r\no=demo' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { session: { id: 'live_test' }, transport: { type: 'webrtc', sdp: 'answer' } });
});

test('API failures never echo upstream secrets and missing key is actionable', async context => {
  const request = await fixture(context, async () => new Response('test-server-secret', { status: 401 }));
  const response = await request('session', { sdp: 'v=0\r\no=demo' });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /test-server-secret/);
  const noKey = await fixture(context, () => assert.fail(), '');
  assert.equal((await noKey('session', { sdp: 'v=0\r\no=demo' })).status, 503);
});

test('rate limit bounds repeated requests', async context => {
  const request = await fixture(context, () => assert.fail());
  for (let index = 0; index < 10; index += 1) await request('session', {});
  assert.equal((await request('session', {})).status, 429);
});
