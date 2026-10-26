import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, cp, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID, pbkdf2Sync, createHash } from 'node:crypto';
import { createApplication, validateOrigin } from '../dist-node/application.mjs';
import { localBucket } from '../server/storage.mjs';
import { createSnapshot, verifySnapshot } from '../server/backup.mjs';
import { createPassword, verifyPassword } from '../server/password.mjs';

const root = resolve('dist-node');
const ownerPassword = '第一位成员的-私密密码-2026';
const partnerPassword = '第二位成员的-私密密码-2026';

test('standalone server works with no Cloudflare or ChatGPT identity', async t => {
  const work = await mkdtemp(join(tmpdir(), 'little-days-node-'));
  const dataDir = resolve(work, 'data');
  let app, origin;
  async function start(directory = dataDir) {
    app = createApplication({ root, dataDir: directory, origin: 'http://127.0.0.1:0' });
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    origin = `http://127.0.0.1:${app.server.address().port}`; app.env.APP_ORIGIN = origin;
  }
  const call = (path, options = {}) => fetch(origin + path, options);
  const post = (path, body, cookie, method = 'POST', extra = {}) => call(path, { method,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: JSON.stringify(body) });
  const get = (path, cookie, extra = {}) => call(path, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra } });
  const login = async (slot, password) => {
    const response = await post('/api/auth', { slot, password });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.get('set-cookie').split(';')[0];
  };
  const change = (cookie, kind, payload, id = randomUUID()) => post('/api/home', { id, kind, payload }, cookie);
  let ownerCookie, partnerCookie, photoId, roomState;
  const jpeg = Buffer.from([255, 216, 255, 224, 12, 34, 255, 217]);
  t.after(async () => { await app?.close(); await rm(work, { recursive: true, force: true }); });

  await t.test('only HTTPS or loopback HTTP origins are accepted', () => {
    assert.throws(() => validateOrigin('http://example.com'));
    assert.throws(() => validateOrigin('https://example.com/'));
    assert.throws(() => validateOrigin('https://user:pass@example.com'));
    assert.equal(validateOrigin('https://example.com').origin, 'https://example.com');
  });

  await t.test('CLI initializes two independent passwords without printing them or overwriting an existing home', async () => {
    const command = () => spawnSync(process.execPath, [resolve(root, 'admin.mjs'), 'init', '--stdin'], {
      env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8',
      input: JSON.stringify({ names: ['小月', '小林'], passwords: [ownerPassword, partnerPassword] }),
    });
    const first = command(); assert.equal(first.status, 0, first.stderr);
    assert.ok(!first.stdout.includes(ownerPassword)); assert.ok(!first.stdout.includes(partnerPassword));
    const second = command(); assert.equal(second.status, 1); assert.match(second.stderr, /已初始化/);
    await start();
  });

  await t.test('private data rejects anonymous, forged platform identities, and direct filesystem paths', async () => {
    assert.equal((await get('/')).status, 200);
    const html = await (await get('/')).text();
    assert.ok(!html.includes('href="/signin-with-chatgpt')); assert.ok(!html.includes('小月')); assert.ok(html.includes('LITTLE_DAYS_STANDALONE'));
    assert.equal((await get('/healthz')).status, 200);
    assert.equal((await get('/api/home')).status, 401);
    assert.equal((await get('/api/home', null, { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'seedy@sites.test' })).status, 401);
    for (const path of ['/data/home.sqlite', '/.env', '/.git/config', '/signin-with-chatgpt']) assert.equal((await get(path)).status, 404);
  });

  await t.test('origin checks, body limits, JSON validation and password verification run before writes', async () => {
    assert.equal((await call('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await post('/api/auth', {}, null, 'POST', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await post('/api/auth', { slot: 1, password: 'incorrect-password' })).status, 401);
    for (const body of ['null', '[1]', '{']) {
      const response = await call('/api/auth', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400);
    }
    assert.equal((await call('/api/auth', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await post('/api/auth', { password: 'x'.repeat(2100) })).status, 413);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(2100))); controller.close(); } });
    const over = await call('/api/auth', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
    assert.equal(over.status, 413);
    ownerCookie = await login(1, ownerPassword); partnerCookie = await login(2, partnerPassword);
  });

  await t.test('first member manages passwords and archives while the second member cannot', async () => {
    const a = await (await get('/api/home', ownerCookie)).json(), b = await (await get('/api/home', partnerCookie)).json();
    assert.equal(a.me.canManagePasswords, true); assert.equal(a.me.loginMethod, 'password'); assert.equal(a.me.slot, 1);
    assert.equal(b.me.canManagePasswords, false); assert.equal(b.me.slot, 2); assert.deepEqual(a.state.names, ['小月', '小林']);
    for (const path of ['/api/passwords', '/api/backup']) assert.equal((await get(path, partnerCookie)).status, 403);
    assert.equal((await post('/api/passwords', { slot: 1, password: partnerPassword }, partnerCookie)).status, 403);
    assert.equal((await get('/api/passwords', ownerCookie)).status, 200);
  });

  await t.test('concurrent writes and duplicate retries preserve both members changes', async () => {
    const id = randomUUID(), payload = { id: randomUUID(), text: '一起看海' };
    const responses = await Promise.all([change(ownerCookie, 'wish.add', payload, id),
      change(partnerCookie, 'story.add', { id: randomUUID(), title: '第一次散步', text: '晚风很温柔', date: '2026-10-23' }),
      change(ownerCookie, 'wish.add', payload, id)]);
    for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
    roomState = await (await get('/api/home', ownerCookie)).json();
    assert.equal(roomState.state.wishes.length, 1); assert.equal(roomState.state.stories.length, 1); assert.equal(roomState.revision, 2);
    assert.equal((await change(ownerCookie, 'letter.add', { id: randomUUID(), author: '小月', text: '未来见', openDate: '2099-01-01' })).status, 200);
    const view = await (await get('/api/home', partnerCookie)).json(); assert.equal(view.state.letters[0].text, ''); assert.equal(view.state.letters[0].locked, true);
    const archive = await (await get('/api/backup', ownerCookie)).json(); assert.equal(archive.state.letters[0].text, '未来见'); assert.ok(!JSON.stringify(archive).includes('password_hash'));
  });

  await t.test('JPEG photos persist privately and unsafe storage paths cannot escape the data directory', async () => {
    const form = new FormData(); form.append('photo', new File([jpeg], 'memory.jpg', { type: 'image/jpeg' })); form.append('caption', '一起看海');
    const uploaded = await call('/api/photos', { method: 'POST', headers: { Origin: origin, Cookie: ownerCookie }, body: form });
    assert.equal(uploaded.status, 200, await uploaded.clone().text()); photoId = (await uploaded.json()).id;
    assert.equal((await get('/api/photos/' + photoId)).status, 401);
    assert.equal((await get('/photos/' + photoId)).status, 404);
    assert.deepEqual(Buffer.from(await (await get('/api/photos/' + photoId, partnerCookie)).arrayBuffer()), jpeg);
    await assert.rejects(() => localBucket(dataDir).put('../escape', jpeg));
    assert.deepEqual(await readFile(resolve(dataDir, 'photos', photoId)), jpeg);
  });

  await t.test('daily answers stay private until both members answer', async () => {
    assert.equal((await change(ownerCookie, 'daily.answer', { answer: '第一位的答案' })).status, 200);
    const hidden = await (await get('/api/home', partnerCookie)).json();
    assert.equal(hidden.state.daily[hidden.state.dailyPrompt.day].answers[1], undefined);
    assert.equal((await change(partnerCookie, 'daily.answer', { answer: '第二位的答案' })).status, 200);
    const revealed = await (await get('/api/home', partnerCookie)).json();
    assert.equal(revealed.state.daily[revealed.state.dailyPrompt.day].answers[1].text, '第一位的答案');
  });

  await t.test('HTTPS uses a host-only Secure HttpOnly cookie and never accepts Cloudflare identity headers', async () => {
    const secureApp = createApplication({ root, dataDir, origin: 'https://home.example' });
    try {
      const response = await secureApp.dispatch(new Request('https://home.example/api/auth', { method: 'POST',
        headers: { Origin: 'https://home.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 1, password: ownerPassword, remember: true }) }));
      assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /^__Host-little_days=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Max-Age=2592000/);
      assert.equal((await secureApp.dispatch(new Request('https://home.example/api/home', { headers: { 'oai-authenticated-user-id': 'local_seedy', 'oai-authenticated-user-email': 'seedy@sites.test' } }))).status, 401);
    } finally { await secureApp.close(); }
  });

  await t.test('one-time recovery rotates its code, invalidates sessions and rejects reuse', async () => {
    assert.equal((await post('/api/recovery', { slot: 2 }, partnerCookie)).status, 403);
    const created = await post('/api/recovery', { slot: 2 }, ownerCookie); assert.equal(created.status, 200);
    const { code } = await created.json(); const newPassword = 'Abc123';assert.match(code,/^[2-9A-HJ-NP-Z]{12}$/);
    const formatted=code.match(/.{4}/g).join(' - ').toLowerCase();
    assert.equal((await post('/api/recovery',{slot:2,code:formatted,password:'short'},null,'PUT')).status,400);
    const reset = await post('/api/recovery', { slot: 2, code:formatted, password: newPassword }, null, 'PUT');
    assert.equal(reset.status, 200);const next=(await reset.json()).code;assert.notEqual(next, code);assert.match(next,/^[2-9A-HJ-NP-Z]{12}$/);
    assert.equal((await get('/api/home', partnerCookie)).status, 401);
    assert.equal((await post('/api/recovery', { slot: 2, code, password: newPassword }, null, 'PUT')).status, 401);
    partnerCookie = await login(2, newPassword);
    const legacy='abcdef0123456789'.repeat(4);
    app.db.raw.prepare('UPDATE recovery_codes SET code_hash=? WHERE slot=2').run(createHash('sha256').update(legacy).digest('hex'));
    const legacyReset=await post('/api/recovery',{slot:2,code:legacy,password:'New789'},null,'PUT');assert.equal(legacyReset.status,200);
    assert.match((await legacyReset.json()).code,/^[2-9A-HJ-NP-Z]{12}$/);
    assert.equal((await get('/api/home',partnerCookie)).status,401);
    assert.equal((await post('/api/recovery',{slot:2,code:legacy,password:'New789'},null,'PUT')).status,401);
    partnerCookie=await login(2,'New789');
  });

  await t.test('album accepts photos beyond 200, caps at 2000, and still permits idempotent retries', async () => {
    const row=app.db.raw.prepare('SELECT object_key,user_id FROM photos WHERE id=?').get(photoId);
    const insert=app.db.raw.prepare('INSERT INTO photos (id,object_key,caption,created_at,user_id) VALUES (?,?,?,?,?)');
    const add=(from,to)=>app.db.transaction(()=>{for(let i=from;i<to;i++)insert.run('capacity-fixture-'+i,row.object_key,'capacity fixture',Date.now(),row.user_id)});
    const upload=(caption='capacity upload')=>{const body=new FormData();body.append('photo',new File([jpeg],'capacity.jpg',{type:'image/jpeg'}));body.append('caption',caption);body.append('merge','1');return call('/api/photos',{method:'POST',headers:{Origin:origin,Cookie:ownerCookie},body})};
    const uploadedIds=[];
    try{
      add(0,199);const uploaded=await upload();assert.equal(uploaded.status,200,await uploaded.clone().text());uploadedIds.push((await uploaded.json()).id);
      assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photos').get().n,201);
      add(199,1997);assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photos').get().n,1999);
      const put=app.env.BUCKET.put;let arrivals=0,release;
      const gate=new Promise(resolve=>release=resolve),timer=setTimeout(()=>release(),1500);
      app.env.BUCKET.put=async(...args)=>{if(++arrivals===2)release();await gate;return put(...args)};
      let concurrent;
      try{concurrent=await Promise.all([upload('last slot A'),upload('last slot B')])}finally{clearTimeout(timer);app.env.BUCKET.put=put}
      for(const response of concurrent)if(response.ok)uploadedIds.push((await response.json()).id);
      assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,400]);
      assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM photos').get().n,2000);
      const retry=await upload();assert.equal(retry.status,200);assert.equal((await retry.json()).existed,true);
      const body=new FormData();body.append('photo',new File([jpeg],'full.jpg',{type:'image/jpeg'}));body.append('caption','new at capacity');
      const full=await call('/api/photos',{method:'POST',headers:{Origin:origin,Cookie:ownerCookie},body});assert.equal(full.status,400);assert.match(await full.text(),/2,000/);
      assert.equal((await readdir(resolve(dataDir,'photos'))).length,3,'rejected uploads must not leave unreferenced photo files');
    }finally{
      app.db.raw.prepare("DELETE FROM photos WHERE id LIKE 'capacity-fixture-%'").run();
      for(const id of uploadedIds)assert.equal((await call('/api/photos/'+id,{method:'DELETE',headers:{Origin:origin,Cookie:ownerCookie}})).status,200);
    }
  });

  await t.test('records, account permissions, photos and sessions survive a server restart', async () => {
    const before = await (await get('/api/home', ownerCookie)).json();
    await app.close(); await start();
    const after = await (await get('/api/home', ownerCookie)).json();
    assert.equal(after.revision, before.revision); assert.equal(after.me.canManagePasswords, true);
    assert.equal(after.state.stories[0].text, '晚风很温柔');
    assert.deepEqual(Buffer.from(await (await get('/api/photos/' + photoId, partnerCookie)).arrayBuffer()), jpeg);
  });

  await t.test('backup CLI executes through the current release symlink used by systemd', async () => {
    const current = resolve(work, 'current'), backupDir = resolve(work, 'symlink-backups');
    await symlink(root, current, process.platform === 'win32' ? 'junction' : 'dir');
    const result = spawnSync(process.execPath, [resolve(current, 'backup.mjs')], {
      env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: backupDir }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /备份完成并通过校验/);
    const snapshots = await readdir(backupDir); assert.equal(snapshots.length, 1);
    const checked = spawnSync(process.execPath, [resolve(current, 'backup.mjs'), '--verify', resolve(backupDir, snapshots[0])], {
      encoding: 'utf8',
    });
    assert.equal(checked.status, 0, checked.stderr); assert.match(checked.stdout, /备份校验通过/);
  });

  await t.test('live snapshots include a valid SQLite database and every referenced photo, restore cleanly and detect tampering', async () => {
    const snapshot = await createSnapshot(dataDir, resolve(work, 'backups'));
    assert.deepEqual(await verifySnapshot(snapshot), { photos: 1, files: 2 });
    const restored = resolve(work, 'restored'); await cp(snapshot, restored, { recursive: true });
    await app.close(); await start(restored);
    const state = await (await get('/api/home', ownerCookie)).json(); assert.equal(state.state.stories[0].title, '第一次散步');
    assert.deepEqual(Buffer.from(await (await get('/api/photos/' + photoId, partnerCookie)).arrayBuffer()), jpeg);
    await writeFile(resolve(snapshot, 'photos', photoId), 'broken'); await assert.rejects(() => verifySnapshot(snapshot), /校验失败/);
    await assert.rejects(() => createSnapshot(dataDir, resolve(dataDir, 'backups')), /数据目录之外/);
  });

  await t.test('server-admin password reset invalidates the old session without deleting memories', async () => {
    const password = '服务器重设的-管理员密码-2026';
    const command = spawnSync(process.execPath, [resolve(root, 'admin.mjs'), 'reset-password', '--stdin'], {
      env: { ...process.env, DATA_DIR: resolve(work, 'restored') }, encoding: 'utf8', input: JSON.stringify({ slot: 1, password }),
    });
    assert.equal(command.status, 0, command.stderr); assert.ok(!command.stdout.includes(password));
    assert.equal((await get('/api/home', ownerCookie)).status, 401); ownerCookie = await login(1, password);
    assert.equal((await (await get('/api/home', ownerCookie)).json()).state.stories[0].title, '第一次散步');
  });
});

test('native password records remain compatible with existing PBKDF2 Unicode hashes', async () => {
  const password = '一起回家♡abcdefghijkl', record = await createPassword(password);
  const expected = pbkdf2Sync(password, Buffer.from(record.salt, 'hex'), 600000, 32, 'sha256').toString('hex');
  assert.equal(record.passwordHash, expected);
  assert.equal(await verifyPassword(password, { salt: record.salt, password_hash: expected }), true);
  assert.equal(await verifyPassword(password + 'x', { salt: record.salt, password_hash: expected }), false);
});

test('first-run password setup and administrator-owned identity names', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'little-days-entry-'));
  let app, origin, wire;
  const password1 = 'Owner6', password2 = 'Mate66';
  async function start(options = {}) {
    app = createApplication({ root, dataDir: resolve(directory, options.folder || 'data'), origin: options.origin || 'http://127.0.0.1:0', setupCode: options.setupCode });
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    wire = `http://127.0.0.1:${app.server.address().port}`;
    origin = options.origin || wire; app.env.APP_ORIGIN = origin;
  }
  const call = (path, { method = 'GET', body, cookie, source = origin } = {}) => {
    const headers = { Host: new URL(origin).host, Origin: source, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
    const text = body !== undefined ? JSON.stringify(body) : undefined;
    if (!origin.startsWith('https:')) return fetch(wire + path, { method, headers, ...(text !== undefined ? { body: text } : {}) });
    // Simulate Nginx TLS termination with an explicit original Host header.
    return new Promise((resolveResponse, reject) => {
      const request = httpRequest(wire + path, { method, headers }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
        response.on('end', () => resolveResponse(new Response(Buffer.concat(chunks), { status: response.statusCode,
          headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])) })));
      });
      request.on('error', reject); request.end(text);
    });
  };
  const setup = { passwords: [password1, password2], confirmations: [password1, password2] };
  let cookie1, cookie2;
  t.after(async () => { await app?.close(); await rm(directory, { recursive: true, force: true }); });
  await start();
  await t.test('empty homes expose first-run status and neutral member labels without leaking setup secrets', async () => {
    const status = await (await call('/api/entry')).json();
    assert.deepEqual(status, { setupRequired: true, requiresSetupCode: false, identityNames: ['成员一', '成员二'] });
    const html = await (await call('/')).text(); assert.ok(html.includes('/entry.js')); assert.ok(html.includes('id="entry-help"')); assert.ok(html.includes('>成员一</option>')); assert.ok(!html.includes('成员一 · 管理员')); assert.ok(!html.includes('老大'));
  });
  await t.test('incorrect confirmation, weak passwords and foreign origins cannot create a home', async () => {
    assert.equal((await call('/api/setup', { method: 'POST', body: setup, source: 'https://evil.test' })).status, 403);
    assert.equal((await call('/api/setup', { method: 'POST', body: { ...setup, confirmations: ['different', password2] } })).status, 400);
    assert.equal((await call('/api/setup', { method: 'POST', body: { passwords: ['short', 'short'], confirmations: ['short', 'short'] } })).status, 400);
    assert.equal((await call('/api/setup', { method: 'POST', body: null })).status, 400);
    assert.equal((await (await call('/api/entry')).json()).setupRequired, true);
  });
  await t.test('web setup sets both passwords and signs the first member in as administrator', async () => {
    const response = await call('/api/setup', { method: 'POST', body: setup }); assert.equal(response.status, 200, await response.clone().text());
    cookie1 = response.headers.get('set-cookie').split(';')[0];
    const home = await (await call('/api/home', { cookie: cookie1 })).json();
    assert.equal(home.me.canManagePasswords, true); assert.equal(home.me.slot, 1);
    assert.deepEqual(home.identityNames, ['成员一', '成员二']); assert.deepEqual(home.state.names, ['成员一', '成员二']);
    const partner = await call('/api/auth', { method: 'POST', body: { slot: 2, password: password2 } }); assert.equal(partner.status, 200);
    cookie2 = partner.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await call('/api/home', { cookie: cookie2 })).json()).me.canManagePasswords, false);
    assert.equal((await (await call('/api/entry')).json()).setupRequired, false);
    assert.equal((await call('/api/setup', { method: 'POST', body: setup })).status, 409);
  });
  await t.test('only the administrator can rename login identities without changing credentials or personal names', async () => {
    assert.equal((await call('/api/identities', { method: 'PUT', body: { identityNames: ['管理员', '宝贝'] } })).status, 403);
    assert.equal((await call('/api/identities', { method: 'PUT', body: { identityNames: ['管理员', '宝贝'] }, cookie: cookie2 })).status, 403);
    for (const names of [['相同', '相同'], ['', '二'], ['x'.repeat(21), '二'], [1, '二']]) assert.equal((await call('/api/identities', { method: 'PUT', body: { identityNames: names }, cookie: cookie1 })).status, 400);
    const renamed = await call('/api/identities', { method: 'PUT', body: { identityNames: ['小太阳', '小月亮'] }, cookie: cookie1 }); assert.equal(renamed.status, 200);
    assert.deepEqual((await (await call('/api/entry')).json()).identityNames, ['小太阳', '小月亮']);
    const home = await (await call('/api/home', { cookie: cookie2 })).json();
    assert.deepEqual(home.identityNames, ['小太阳', '小月亮']); assert.deepEqual(home.state.names, ['成员一', '成员二']);
    assert.equal(home.me.slot, 2); assert.equal(home.me.canManagePasswords, false);
  });
  await t.test('custom identities survive restart and first-run setup stays closed', async () => {
    await app.close(); await start();
    assert.deepEqual((await (await call('/api/entry')).json()).identityNames, ['小太阳', '小月亮']);
    assert.equal((await call('/api/setup', { method: 'POST', body: setup })).status, 409);
    assert.equal((await call('/api/home', { cookie: cookie1 })).status, 200);
  });
  await t.test('competing setup requests cannot overwrite the first owner', async () => {
    await app.close(); await start({ folder: 'concurrent' });
    const responses = await Promise.all([call('/api/setup', { method: 'POST', body: setup }), call('/api/setup', { method: 'POST', body: setup })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM members').get().n, 2);
  });
  await t.test('public HTTPS setup requires the private initialization code even behind a loopback proxy', async () => {
    await app.close(); const code = 'Fixture-private-initialization-code-2026';
    await start({ folder: 'public', origin: 'https://setup.example', setupCode: code });
    const metadata = await (await call('/api/entry')).json(); assert.equal(metadata.requiresSetupCode, true, JSON.stringify(metadata)); assert.ok(!JSON.stringify(metadata).includes(code));
    assert.equal((await call('/api/setup', { method: 'POST', body: setup })).status, 403);
    assert.equal((await call('/api/setup', { method: 'POST', body: { ...setup, code: 'wrong' } })).status, 403);
    const created = await call('/api/setup', { method: 'POST', body: { ...setup, code } }); assert.equal(created.status, 200); assert.match(created.headers.get('set-cookie'), /Secure/);
    assert.equal((await call('/api/setup', { method: 'POST', body: { ...setup, code } })).status, 409);
  });
});

test('an interrupted upload cannot terminate the server process', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'little-days-abort-'));
  const child = spawn(process.execPath, [resolve(root, 'server.mjs')], { env: { ...process.env,
    DATA_DIR: directory, HOST: '127.0.0.1', PORT: '0', APP_ORIGIN: 'http://127.0.0.1:0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(directory, { recursive: true, force: true });
  });
  const origin = await new Promise((resolveOrigin, reject) => {
    const deadline = setTimeout(() => reject(new Error('server startup timeout')), 10000);
    child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(deadline); resolveOrigin(match[0]); } });
    child.once('exit', () => { clearTimeout(deadline); reject(new Error(errors)); });
  });
  const url = new URL(origin), socket = createConnection({ host: '127.0.0.1', port: Number(url.port) });
  socket.on('error', () => {});
  await once(socket, 'connect');
  socket.write(`POST /api/home HTTP/1.1\r\nHost: ${url.host}\r\nOrigin: ${origin}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
  await delay(50); socket.destroy(); await delay(200);
  assert.equal(child.exitCode, null, errors);
  assert.equal((await fetch(origin + '/healthz')).status, 200);
});
