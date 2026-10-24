// Shared browser helpers. Drafts contain only allowlisted, unsent text fields.
(function (root) {
  const TTL = 7 * 86400000;
  const fields = { story: ['date', 'title', 'text'], letter: ['author', 'text', 'openDate'] };
  function requestFailureMessage(error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return '连接等待超时，请稍后重试。刚才的操作尚未确认保存。';
    return '没有连接到小屋后端。可能是网络中断或入口被拦截，暂时无法验证密码，请稍后重试。';
  }
  function photoNearViewport(image, height) {
    if (!image.getClientRects().length) return false;
    const box = image.getBoundingClientRect();
    return box.bottom >= -240 && box.top <= height + 240;
  }
  function createDraftStore(storage, scope) {
    const key = kind => 'little-days-draft:' + scope + ':' + kind;
    function remove(kind) { try { storage.removeItem(key(kind)); } catch {} }
    function clean(kind, values) {
      if (!Object.hasOwn(fields, kind)) return null;
      return Object.fromEntries(fields[kind].map(name => [name, typeof values?.[name] === 'string' ? values[name].slice(0, 3000) : '']));
    }
    function read(kind, now = Date.now()) {
      if (!Object.hasOwn(fields, kind)) return null;
      try {
        const saved = JSON.parse(storage.getItem(key(kind)) || 'null');
        if (!saved || !Number.isSafeInteger(saved.at) || saved.at > now || now - saved.at >= TTL) { remove(kind); return null; }
        return clean(kind, saved.values);
      } catch { remove(kind); return null; }
    }
    function write(kind, values, now = Date.now()) {
      const safe = clean(kind, values);
      if (!safe) return false;
      try { storage.setItem(key(kind), JSON.stringify({ at: now, values: safe })); return true; } catch { return false; }
    }
    return { read, write, remove };
  }
  root.LittleDaysHelpers = { requestFailureMessage, photoNearViewport, createDraftStore };
})(globalThis);
