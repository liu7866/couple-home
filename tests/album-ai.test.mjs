import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApplication } from '../dist-node/application.mjs';
import { albumAIConfig, normalizeAnalysis, normalizeEmbedding } from '../lib/album-ai.mjs';

test('AI configuration and provider responses have bounded, strict formats', () => {
  const settings = { ALBUM_AI_BASE_URL: 'https://ai.example/v1', ALBUM_AI_API_KEY: 'fixture-key', ALBUM_AI_VISION_MODEL: 'vision-fixture', ALBUM_AI_EMBEDDING_MODEL: 'embedding-fixture' };
  assert.equal(albumAIConfig({}), null);
  assert.equal(albumAIConfig({ ...settings, ALBUM_AI_EMBEDDING_MODEL: '' }), null);
  for (const url of ['http://public.example/v1', 'https://user:pass@ai.example/v1', 'https://ai.example/v1?key=secret', 'https://ai.example/v1#key']) assert.equal(albumAIConfig({ ...settings, ALBUM_AI_BASE_URL: url }), null);
  assert.equal(albumAIConfig(settings).baseURL, 'https://ai.example/v1');
  assert.equal(albumAIConfig({ ...settings, ALBUM_AI_BASE_URL: 'http://127.0.0.1:11434/v1' }).provider, 'http://127.0.0.1:11434');
  for (const vector of [[], [0, 0], [1, NaN], ['1'], Array(4097).fill(1)]) assert.throws(() => normalizeEmbedding(vector), e => e.status === 502);
  assert.deepEqual(normalizeEmbedding([3, 4]), [0.6, 0.8]);
  for (const value of [null, { description: '', tags: [], category: '其他' }, { description: '可见场景', tags: ['x'.repeat(25)], category: '其他' }, { description: '可见场景', tags: [], category: '未知' }]) assert.throws(() => normalizeAnalysis(value), e => e.status === 502);
  assert.deepEqual(normalizeAnalysis({ description: ' 海边 ', tags: ['日落', '日落'], category: '风景' }), { description: '海边', tags: ['日落'], category: '风景' });
});

test('optional AI album integrates with isolated accounts, photos and a mock compatible provider', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'couple-album-ai-'));
  const key = 'fixture-provider-key-never-return-to-browser';
  let requests = 0, mode = 'ok', visionHook = null, app;
  const provider = createServer(async (req, res) => {
    requests++; const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(req.headers.authorization, 'Bearer ' + key);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'fail') { res.statusCode = 401; res.end(JSON.stringify({ error: key })); return; }
    if (mode === 'huge') { res.end(JSON.stringify({ content: 'x'.repeat(530000) })); return; }
    if (req.url === '/v1/chat/completions') {
      const hook = visionHook; visionHook = null; if (hook) await hook();
      assert.equal(body.model, 'vision-fixture');
      const image = body.messages[1].content[1].image_url.url;
      assert.ok(image.startsWith('data:image/jpeg;base64,'));
      const food = body.messages[1].content[0].text.includes('晚餐');
      const value = food ? { description: '餐桌上的热汤和晚餐', tags: ['美食', '晚餐'], category: '美食' } : { description: '沙滩与落日，金色海面', tags: ['沙滩', '日落'], category: '风景' };
      res.end(JSON.stringify({ choices: [{ message: { content: mode === 'malformed' ? '{invalid' : JSON.stringify(value) } }] }));
    } else if (req.url === '/v1/embeddings') {
      assert.equal(body.model, 'embedding-fixture'); assert.equal(body.encoding_format, 'float');
      res.end(JSON.stringify({ data: [{ embedding: mode === 'bad-vector' ? [0, 0, 0] : body.input.includes('晚餐') ? [0, 1, 0] : [1, 0, 0] }] }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const albumAI = { baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: key, visionModel: 'vision-fixture', embeddingModel: 'embedding-fixture' };
  const options = { root: resolve('dist-node'), dataDir: directory, origin: 'http://127.0.0.1:43108', albumAI };
  app = createApplication(options);
  t.after(async () => { await app.close(); await new Promise(resolveClose => provider.close(resolveClose)); await rm(directory, { recursive: true, force: true }); });
  const call = (path, { method = 'GET', body, cookie, source = options.origin } = {}) => app.dispatch(new Request(options.origin + path, {
    method, headers: { Origin: source, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }));
  const passwords = ['Owner66', 'Mate666'];
  const setup = await call('/api/setup', { method: 'POST', body: { passwords, confirmations: passwords } }); assert.equal(setup.status, 200);
  const cookie = setup.headers.getSetCookie()[0].split(';')[0];
  const partnerLogin = await call('/api/auth', { method: 'POST', body: { slot: 2, password: passwords[1] } });
  const partner = partnerLogin.headers.getSetCookie()[0].split(';')[0];
  async function upload(caption) {
    const body = new FormData(); body.append('photo', new File([new Uint8Array([255, 216, 255, 224, 1, 2, 255, 217])], 'fixture.jpg', { type: 'image/jpeg' })); body.append('caption', caption);
    const response = await app.dispatch(new Request(options.origin + '/api/photos', { method: 'POST', headers: { Origin: options.origin, Cookie: cookie }, body }));
    assert.equal(response.status, 200); return (await response.json()).id;
  }
  const beach = await upload('周末散步'), dinner = await upload('一起做晚餐'), extra = await upload('第三张照片');
  const analyze = photoId => call('/api/album-ai', { method: 'POST', cookie, body: { photoId, consent: true } });

  await t.test('upload, status and normal album never call the provider; AI needs login, origin, owner and consent', async () => {
    assert.equal((await call('/api/album-ai')).status, 401);
    assert.equal((await call('/api/album-search', { method: 'POST', body: { query: '日落' } })).status, 401);
    assert.equal((await call('/api/album-ai', { method: 'POST', cookie, source: 'https://evil.test', body: { photoId: beach, consent: true } })).status, 403);
    assert.equal((await call('/api/album-ai', { method: 'POST', cookie: partner, body: { photoId: beach, consent: true } })).status, 403);
    assert.equal((await call('/api/album-ai', { method: 'POST', cookie, body: { photoId: beach } })).status, 400);
    const status = await (await call('/api/album-ai', { cookie })).json(); assert.equal(status.enabled, true); assert.equal(status.pendingIds.length, 3); assert.ok(!JSON.stringify(status).includes(key));
    assert.equal((await call('/api/home', { cookie })).status, 200); assert.equal(requests, 0);
    const setting = app.env.ALBUM_AI_API_KEY; app.env.ALBUM_AI_API_KEY = '';
    assert.equal((await (await call('/api/album-ai', { cookie })).json()).enabled, false);
    assert.equal((await analyze(beach)).status, 503); assert.equal((await call('/api/home', { cookie })).status, 200);
    app.env.ALBUM_AI_API_KEY = setting;
  });
  await t.test('analysis saves categories and vectors, cached retries are free, and polling sees metadata changes', async () => {
    const before = await (await call('/api/home', { cookie })).json();
    assert.equal((await analyze(beach)).status, 200); assert.equal((await analyze(dinner)).status, 200); assert.equal(requests, 4);
    const retry = await (await analyze(beach)).json(); assert.equal(retry.cached, true); assert.equal(requests, 4);
    const after = await (await call('/api/home', { cookie: partner })).json();
    assert.equal(after.state.photos.find(photo => photo.id === beach).ai.category, '风景');
    assert.ok(!JSON.stringify(after).includes('embedding')); assert.ok(!JSON.stringify(after).includes(key));
    const changed = await (await call('/api/home?since=' + before.syncTag, { cookie })).json(); assert.ok(changed.state);
    await app.close(); app = createApplication(options);
    assert.equal((await (await call('/api/home', { cookie })).json()).state.photos.find(photo => photo.id === beach).ai.category, '风景');
  });
  await t.test('semantic search matches similar meaning without shared caption words and excludes unrelated photos', async () => {
    const response = await call('/api/album-search', { method: 'POST', cookie: partner, body: { query: '傍晚海岸的金色天空' } }); assert.equal(response.status, 200);
    const data = await response.json(); assert.deepEqual(data.matches.map(match => match.id), [beach]); assert.equal(data.indexed, 2);
    const before = requests;
    for (const query of ['', ' '.repeat(2), 'x'.repeat(201), null]) assert.equal((await call('/api/album-search', { method: 'POST', cookie, body: { query } })).status, 400);
    assert.equal(requests, before);
    app.env.ALBUM_AI_EMBEDDING_MODEL = 'different-model';
    assert.deepEqual((await (await call('/api/album-search', { method: 'POST', cookie, body: { query: '落日' } })).json()).matches, []);
    assert.equal(requests, before); app.env.ALBUM_AI_EMBEDDING_MODEL = albumAI.embeddingModel;
  });
  await t.test('provider failures and oversized responses never leak secrets, save partial indexes or lose photos', async () => {
    for (const failure of ['fail', 'malformed', 'bad-vector', 'huge']) {
      mode = failure; const response = await analyze(extra); assert.equal(response.status, 502, failure);
      assert.ok(!(await response.text()).includes(key));
      assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photo_ai WHERE photo_id=?').get(extra).n, 0);
      assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photo_ai_jobs').get().n, 0);
      assert.equal((await call('/api/photos/' + extra, { cookie })).status, 200);
    }
    mode = 'ok';
  });
  await t.test('simultaneous analysis uses one provider job and clearing invalidates in-flight work', async () => {
    const before = requests; let release, entered;
    const gate = new Promise(resolveGate => release = resolveGate), started = new Promise(resolveStarted => entered = resolveStarted);
    visionHook = async () => { entered(); await gate; };
    const first = analyze(extra); await started;
    assert.equal((await analyze(extra)).status, 409); release(); assert.equal((await first).status, 200); assert.equal(requests, before + 2);
    assert.equal((await call('/api/album-ai', { method: 'DELETE', cookie: partner })).status, 403);
    const fourth = await upload('第四张照片');
    visionHook = async () => { assert.equal((await call('/api/album-ai', { method: 'DELETE', cookie })).status, 200); };
    assert.equal((await analyze(fourth)).status, 409);
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photo_ai').get().n, 0);
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 4);
  });
  await t.test('deleting a photo cascades its AI metadata; rate limiting rejects costly work before provider calls', async () => {
    assert.equal((await analyze(beach)).status, 200);
    assert.equal((await call('/api/photos/' + beach, { method: 'DELETE', cookie })).status, 200);
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photo_ai WHERE photo_id=?').get(beach).n, 0);
    const user = app.db.raw.prepare('SELECT user_id FROM members WHERE slot=1').get().user_id;
    app.db.raw.prepare('UPDATE auth_attempts SET count=60,expires_at=? WHERE ip_hash=?').run(Date.now() + 600000, 'album-ai:' + user);
    const before = requests; assert.equal((await analyze(dinner)).status, 429); assert.equal(requests, before);
  });
});
