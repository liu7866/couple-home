import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase, localBucket } from './storage.mjs';
import { requests } from './request-context.mjs';
import { HomeError } from '../lib/home-domain.mjs';
import { createEntry, identityNames } from './entry.mjs';
import * as home from '../app/api/home/route.ts';
import * as auth from '../app/api/auth/route.ts';
import * as passwords from '../app/api/passwords/route.ts';
import * as recovery from '../app/api/recovery/route.ts';
import * as backup from '../app/api/backup/route.ts';
import * as restore from '../app/api/restore/route.ts';
import * as photos from '../app/api/photos/route.ts';
import * as photo from '../app/api/photos/[id]/route.ts';

const routes = new Map([['/api/home', home], ['/api/auth', auth], ['/api/passwords', passwords],
  ['/api/recovery', recovery], ['/api/backup', backup], ['/api/restore', restore], ['/api/photos', photos]]);
const staticFiles = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/pet-view.js', ['pet-view.js', 'text/javascript; charset=utf-8']], ['/features.js', ['features.js', 'text/javascript; charset=utf-8']], ['/room-helpers.js', ['room-helpers.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
staticFiles.set('/entry.js', ['entry.js', 'text/javascript; charset=utf-8']);
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
const jsonError = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

function readBody(stream, limit) {
  return new Promise((resolveBody, reject) => {
    const parts = []; let size = 0;
    const clean = () => { stream.off('data', data); stream.off('end', end); stream.off('error', failed); stream.off('aborted', aborted); };
    const failed = error => { clean(); reject(error); };
    const aborted = () => failed(new HomeError('请求已中断。'));
    const end = () => { clean(); resolveBody(Buffer.concat(parts)); };
    const data = chunk => {
      size += chunk.length;
      if (size > limit) { clean(); stream.resume(); reject(new HomeError('请求内容太大。', 413)); }
      else parts.push(chunk);
    };
    stream.on('data', data); stream.once('end', end); stream.once('error', failed); stream.once('aborted', aborted);
  });
}

export function validateOrigin(value) {
  const origin = new URL(value);
  if (origin.origin !== value || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
    throw new Error('APP_ORIGIN 必须是完整 HTTPS 来源（不带路径或末尾斜线）；HTTP 只允许本机开发地址。');
  }
  return origin;
}

export function createApplication({ root, dataDir, origin, trustProxy = false, setupCode }) {
  validateOrigin(origin);
  const db = openDatabase(dataDir, resolve(root, 'drizzle'));
  const env = { DB: db, BUCKET: localBucket(dataDir), APP_ORIGIN: origin, PAGES_ORIGIN: '' };
  let entry;
  try { entry = createEntry({ db, dataDir, origin, setupCode }); }
  catch (error) { db.close(); throw error; }
  const assets = new Map();
  let active = 0;

  async function dispatch(request) {
    return requests.run({ request, env }, async () => {
      const url = new URL(request.url);
      if (url.origin !== env.APP_ORIGIN) return jsonError('请求来源不正确。', 400);
      if (url.pathname === '/api/entry' && request.method === 'GET') return Response.json(entry.status(), { headers: { 'Cache-Control': 'no-store' } });
      if (url.pathname === '/api/setup' && request.method === 'POST') {
        const password = await entry.setup(request);
        return auth.POST(new Request(new URL('/api/auth', request.url), { method: 'POST', headers: request.headers,
          body: JSON.stringify({ slot: 1, password }) }));
      }
      if (url.pathname === '/api/identities' && request.method === 'PUT') return Response.json(await entry.rename(request), { headers: { 'Cache-Control': 'no-store' } });
      if (url.pathname === '/healthz' && request.method === 'GET') {
        db.raw.prepare('SELECT 1').get();
        return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const match = /^\/api\/photos\/([a-zA-Z0-9_-]{8,100})$/.exec(url.pathname);
      const route = routes.get(url.pathname) || (match ? photo : null);
      if (route) {
        const handler = route[request.method];
        if (typeof handler !== 'function') return new Response(null, { status: 405, headers: { Allow: Object.keys(route).filter(x => /^[A-Z]+$/.test(x)).join(', ') } });
        const response = await handler(request, { params: Promise.resolve(match ? { id: match[1] } : {}) });
        if (response.ok && ['/api/home', '/api/restore'].includes(url.pathname)) return Response.json({ ...await response.json(), identityNames: identityNames(db) }, { headers: response.headers });
        return response;
      }
      const asset = staticFiles.get(url.pathname);
      if (!asset) return jsonError('页面不存在。', 404);
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      if (!assets.has(url.pathname)) assets.set(url.pathname, await readFile(resolve(root, 'public', asset[0])));
      return new Response(assets.get(url.pathname), { headers: { 'Content-Type': asset[1], 'Cache-Control': 'no-store' } });
    });
  }

  const server = createServer(async (incoming, outgoing) => {
    let counted = false;
    try {
      if (active >= 32) { await send(jsonError('小屋正在忙，请稍后重试。', 503)); return; }
      active++; counted = true;
      if (incoming.headers.host !== new URL(env.APP_ORIGIN).host || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        await send(jsonError('请求地址不正确。', 400)); return;
      }
      const url = new URL(incoming.url, env.APP_ORIGIN);
      if (url.origin !== env.APP_ORIGIN) { await send(jsonError('请求地址不正确。', 400)); return; }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined && !name.startsWith('oai-') && name !== 'cf-connecting-ip') headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const remote = incoming.socket.remoteAddress || 'unknown';
      const forwarded = incoming.headers['x-real-ip'];
      headers.set('cf-connecting-ip', trustProxy && loopback(remote) && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : remote);
      const method = incoming.method || 'GET';
      let body;
      if (!['GET', 'HEAD'].includes(method)) {
        const photoUpload = url.pathname === '/api/photos' && method === 'POST';
        const limit = photoUpload ? 5 * 1024 * 1024 : ['/api/auth', '/api/passwords', '/api/recovery', '/api/setup', '/api/identities'].includes(url.pathname) ? 2000 : 2 * 1024 * 1024;
        if (Number(headers.get('content-length') || 0) > limit) throw new HomeError('请求内容太大。', 413);
        body = await readBody(incoming, limit);
        if (body.length && url.pathname.startsWith('/api/')) {
          if (photoUpload) {
            if (!/^multipart\/form-data;\s*boundary=/i.test(headers.get('content-type') || '')) throw new HomeError('照片上传格式不正确。', 415);
          } else {
            if (!/^application\/json(?:;|$)/i.test(headers.get('content-type') || '')) throw new HomeError('请使用 JSON 请求。', 415);
            let parsed; try { parsed = JSON.parse(body.toString('utf8')); } catch { throw new HomeError('请求内容无效。'); }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HomeError('请求内容必须是 JSON 对象。');
          }
        }
      }
      const request = new Request(url, { method, headers, ...(body?.length ? { body } : {}) });
      await send(await dispatch(request));
    } catch (error) {
      if (!(error instanceof HomeError)) console.error('请求处理失败：', error.message);
      if (!outgoing.headersSent) await send(jsonError(error instanceof HomeError ? error.message : '小屋暂时没有连接上，请稍后重试。', error instanceof HomeError ? error.status : 503));
      else outgoing.destroy();
    } finally { if (counted) active--; }

    async function send(response) {
      const headers = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      if (response.status === 413) headers.Connection = 'close';
      Object.assign(headers, {
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      if (env.APP_ORIGIN.startsWith('https:')) headers['Strict-Transport-Security'] = 'max-age=31536000';
      outgoing.writeHead(response.status, headers);
      if (incoming.method === 'HEAD' || !response.body) { outgoing.end(); return; }
      // Response bodies are bounded by the upload limits or the capped room state.
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.maxHeadersCount = 64;
  let closed = false;
  return { server, env, db, dispatch, setupCode: entry.code, async close() {
    if (closed) return;
    closed = true;
    if (server.listening) await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    db.close();
  } };
}
