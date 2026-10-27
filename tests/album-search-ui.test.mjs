import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile('public/album.js', 'utf8');
const date = Date.UTC(2026, 9, 27);
const photos = [
  { id: 'beach-photo', caption: '周末', created_at: date, ai: { description: '沙滩与落日', category: '风景', tags: ['海边'], updatedAt: 1 } },
  { id: 'dinner-photo', caption: '一起吃晚餐', created_at: date, ai: { description: '热汤和烤面包', category: '美食', tags: ['晚餐'], updatedAt: 1 } },
  { id: 'new-photo', caption: '还没整理的小猫', created_at: Date.UTC(2026, 8, 20), ai: null },
];
function fixture(data = photos) {
  const nodes = new Map(), calls = [], notes = []; let submit, formHTML, searchHandler;
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, { value: '', dataset: {}, textContent: '' }); return nodes.get(selector); };
  const context = vm.createContext({ state: { photos: structuredClone(data) }, me: { canManagePasswords: true }, ready: true, albumMonth: '', albumLimit: 12,
    $: get, Date, Map, Set, JSON, console, location: { hash: '#/album' }, window: { addEventListener() {} },
    renderContent: (selector, html) => { get(selector).innerHTML = html; }, esc: String, toast: text => notes.push(text),
    needReady: () => context.ready, requestModalClose: () => true, modal() {}, form: (html, fn) => { formHTML = html; submit = fn; }, close() {},
    renderAlbum: () => context.LittleDaysAlbum?.renderTools(), loadPagesPhotos() {}, refreshNow: async () => {}, confirm: () => true,
    api: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === '/api/album-ai' && !options.method) return { enabled: true, provider: 'https://ai.example', canAnalyze: true, pendingIds: context.state.photos.filter(p => !p.ai).map(p => p.id), indexed: context.state.photos.filter(p => p.ai).length };
      if (path === '/api/album-search') return searchHandler(JSON.parse(options.body));
      return { ok: true };
    },
  });
  vm.runInContext(source, context);
  return { context, get, calls, notes, get submit() { return submit; }, get formHTML() { return formHTML; }, set search(fn) { searchHandler = fn; },
    filter: month => [...context.LittleDaysAlbum.filter(context.state.photos, month || '')].map(p => p.id),
    input: value => { get('#album-query').value = value; get('#album-query').oninput({ target: { value } }); },
    flush: async () => { await Promise.resolve(); await Promise.resolve(); },
  };
}

test('keyword, category and month filters combine while requiring no AI calls', async () => {
  const f = fixture(); await f.flush();
  f.input('海边'); assert.deepEqual(f.filter(), ['beach-photo']);
  f.input('热汤'); assert.deepEqual(f.filter(), ['dinner-photo']);
  f.input(''); f.get('#album-category').onchange({ target: { value: 'unindexed' } }); assert.deepEqual(f.filter(), ['new-photo']);
  assert.deepEqual(f.filter('2026-10'), []);
  f.get('#album-category').onchange({ target: { value: '' } }); assert.equal(f.filter('2026-10').length, 2);
  assert.ok(f.calls.every(call => call.path === '/api/album-ai' && !call.options.method));
});
test('semantic results use provider rank, retain filters, and invalidate when album indexes change', async () => {
  const f = fixture(); await f.flush(); f.search = async () => ({ matches: [{ id: 'dinner-photo' }, { id: 'beach-photo' }], indexed: 2 });
  f.input('想起那一天'); await f.get('#album-semantic').onclick(); assert.deepEqual(f.filter(), ['dinner-photo', 'beach-photo']);
  f.get('#album-category').onchange({ target: { value: '风景' } }); assert.deepEqual(f.filter(), ['beach-photo']);
  f.context.state.photos[0].ai.updatedAt++;
  assert.deepEqual(f.filter(), [], 'stale semantic matches must be discarded');
});
test('typing, reset and logout cannot restore stale in-flight semantic results', async () => {
  const f = fixture(); await f.flush(); let finish;
  f.search = () => new Promise(resolve => { finish = resolve; });
  f.input('海岸'); const pending = f.get('#album-semantic').onclick();
  f.input('晚餐'); finish({ matches: [{ id: 'beach-photo' }], indexed: 2 }); await pending;
  assert.deepEqual(f.filter(), ['dinner-photo']);
  const again = f.get('#album-semantic').onclick(); f.context.LittleDaysAlbum.reset(); f.context.ready = false;
  finish({ matches: [{ id: 'beach-photo' }], indexed: 2 }); await again;
  assert.equal(f.get('#album-query').value, ''); assert.deepEqual(f.filter(), ['beach-photo', 'dinner-photo', 'new-photo']);
});
test('AI organization requires explicit consent, limits each batch, and stops after the current photo', async () => {
  const f = fixture(Array.from({ length: 8 }, (_, i) => ({ id: 'fixture-' + i, caption: '', created_at: date, ai: null }))); await f.flush();
  await f.get('#album-organize').onclick(); assert.ok(f.formHTML.includes('5 张')); assert.ok(f.formHTML.includes('required'));
  await assert.rejects(() => f.submit({ get: () => null }), /确认/);
  assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
  const original = f.context.api;
  f.context.api = async (path, options = {}) => {
    if (options.method === 'POST') { f.get('#album-stop').onclick(); const body = JSON.parse(options.body); assert.equal(body.consent, true); }
    return original(path, options);
  };
  await f.submit({ get: () => 'on' }); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
  assert.equal(f.get('#modal').dataset.busy, '0');
});
test('unconfigured AI leaves ordinary search available and never analyzes automatically', async () => {
  const f = fixture(); await f.flush(); f.context.LittleDaysAlbum.reset();
  f.context.api = async () => ({ enabled: false, provider: '', canAnalyze: true, pendingIds: [], indexed: 0 });
  f.context.LittleDaysAlbum.renderTools(); await f.flush();
  assert.equal(f.get('#album-semantic').disabled, true); assert.equal(f.get('#album-organize').disabled, true);
  f.input('晚餐'); assert.deepEqual(f.filter(), ['dinner-photo']);
});
