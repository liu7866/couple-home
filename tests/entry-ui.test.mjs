import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('custom identity labels are assigned as text while the selected numeric member remains stable', async () => {
  const source = await readFile('public/entry.js', 'utf8');
  const options = [{ value: '1', textContent: '成员一' }, { value: '2', textContent: '成员二' }];
  const select = { value: '2', options };
  const context = vm.createContext({ window: {}, document: { querySelector: selector => { assert.equal(selector, '#login-slot'); return select; } } });
  vm.runInContext(source, context);
  context.window.LittleDaysEntry.applyNames(['<b>管理员</b>', '小月亮']);
  assert.equal(options[0].textContent, '<b>管理员</b>'); assert.equal(options[1].textContent, '小月亮'); assert.equal(select.value, '2');
});

test('an existing home always offers password help without reopening account initialization', async () => {
  const source = await readFile('public/entry.js', 'utf8');
  const actions = { children: [], replaceChildren(){this.children=[]}, append(value){this.children.push(value)} };
  const context = vm.createContext({ window: {}, document: { querySelector: selector => selector === '#entry-actions' ? actions : null,
    createElement: tag => ({ tag }) } });
  vm.runInContext(source, context); const entry = context.window.LittleDaysEntry;
  let helped = 0; entry.passwordHelp = () => helped++;
  entry.showEntryActions({ setupRequired: false });
  const button = actions.children.find(value => value.tag === 'button'); assert.equal(button.textContent, '设置 / 找回密码 ↗');
  button.onclick(); assert.equal(helped, 1);
  entry.showEntryActions({ setupRequired: true });
  assert.equal(actions.children.some(value => value.tag === 'button'), false); assert.match(actions.children[0].textContent, /首次使用/);
});

test('successful first password setup opens room settings after the authenticated refresh', async () => {
  const source = await readFile('public/entry.js', 'utf8'), steps = [], button = {};
  const setup = { querySelector: () => button, reset(){steps.push('reset')}, remove(){} };
  const elements = { '#login-gate': {}, '#key-login-form': {}, '#forgot-password': {}, '#login-note': {}, '.key-login-card h1': {}, '#entry-help': {}, '#setup-form': setup };
  const values = { 'setup-password1':'Owner-fixture#2026', 'setup-confirm1':'Owner-fixture#2026', 'setup-password2':'Partner-fixture#2026', 'setup-confirm2':'Partner-fixture#2026' };
  const context = vm.createContext({ window: {}, document: { body: { classList: { add(){} } }, querySelector: selector => elements[selector] },
    FormData: class { get(name){return values[name]||''} }, api: async path => {assert.equal(path, '/api/setup');steps.push('setup')},
    refreshNow: async () => steps.push('refresh'), editSettings: () => steps.push('settings'), toast: () => {} });
  vm.runInContext(source, context); context.window.LittleDaysEntry.showSetup(false);
  await setup.onsubmit({ preventDefault(){} });
  assert.deepEqual(steps, ['setup','reset','refresh','settings']); assert.equal(button.disabled, false);
});
