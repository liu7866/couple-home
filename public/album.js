(function (root) {
  const categories = ['人物', '美食', '旅行', '风景', '日常', '宠物', '节日', '其他'];
  let query = '', category = '', matches = null, searchIndex = '', searchVersion = 0, epoch = 0, searching = false;
  let config = null, checking = false, checkedAt = 0, organizing = false;
  const indexVersion = photos => JSON.stringify(photos.map(photo => [photo.id, photo.ai?.updatedAt]));
  function filter(photos, month) {
    if (matches && searchIndex !== indexVersion(photos)) matches = null;
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rank = matches ? new Map(matches.map((match, i) => [match.id, i])) : null;
    const result = photos.filter(photo => (!month || new Date(photo.created_at + 8 * 3600000).toISOString().startsWith(month)) &&
      (!category || (category === 'unindexed' ? !photo.ai : photo.ai?.category === category)) &&
      (rank ? rank.has(photo.id) : words.every(word => [photo.caption, photo.ai?.description, ...(photo.ai?.tags || [])].join(' ').toLocaleLowerCase().includes(word))));
    if (rank) result.sort((a, b) => rank.get(a.id) - rank.get(b.id));
    return result;
  }
  function paint() { albumLimit = 12; renderAlbum(); loadPagesPhotos(); }
  function reset() {
    epoch++; searchVersion++; query = ''; category = ''; matches = null; searching = false;
    config = null; checking = false; checkedAt = 0; organizing = false;
    $('#album-query').value = ''; $('#album-category').value = '';
  }
  async function check(force = false) {
    if (!ready || checking || (!force && Date.now() - checkedAt < 60000)) return;
    const started = epoch; checking = true; checkedAt = Date.now();
    try { const data = await api('/api/album-ai'); if (started !== epoch) return; config = data; }
    catch { if (started === epoch) config = null; }
    finally { if (started === epoch) { checking = false; renderTools(); } }
  }
  function renderTools() {
    const counts = new Map(); for (const photo of state.photos) if (photo.ai) counts.set(photo.ai.category, (counts.get(photo.ai.category) || 0) + 1);
    renderContent('#album-category', '<option value="">全部分类</option><option value="unindexed">尚未整理</option>' +
      categories.map(name => `<option value="${name}">${name}（${counts.get(name) || 0}）</option>`).join(''));
    $('#album-category').value = category;
    $('#album-semantic').disabled = !ready || !config?.enabled || searching;
    $('#album-organize').hidden = !me?.canManagePasswords;
    $('#album-organize').disabled = !config?.enabled || organizing;
    $('#album-ai-clear').hidden = !me?.canManagePasswords || !state.photos.some(photo => photo.ai);
    const organized = state.photos.filter(photo => photo.ai).length;
    $('#album-ai-note').textContent = config?.enabled
      ? `已整理 ${organized} / ${state.photos.length} 张。AI 整理发送你确认的照片，AI 搜索发送搜索文字至 ${config.provider}；可能产生服务费用。`
      : '文字搜索和月份筛选直接可用。AI 整理与语义搜索为可选功能，需部署者配置服务后启用。';
    $('#album-search-note').textContent = searching ? '正在找相近的回忆……' : matches ? `AI 找到 ${matches.length} 张相近照片，可继续按月份或分类筛选。` : query ? '正在按备注、描述和标签查找。' : '';
    if (ready && !checking && Date.now() - checkedAt >= 60000) void check();
  }
  async function semantic() {
    if (!needReady() || searching) return;
    const text = $('#album-query').value.trim(); if (!text) return toast('先描述一下想找的照片吧。');
    if (!config?.enabled) return toast('请部署者先配置 AI 服务，也可以直接用文字搜索。');
    const currentEpoch = epoch, version = ++searchVersion, index = indexVersion(state.photos); searching = true; renderTools();
    try {
      const data = await api('/api/album-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) });
      if (currentEpoch !== epoch || version !== searchVersion) return;
      if (index !== indexVersion(state.photos)) return toast('相册刚刚更新了，再找一次吧。');
      query = text; matches = data.matches; searchIndex = index; paint();
      if (!data.indexed) toast('先请管理员整理几张照片，再来找回忆吧。');
    } catch (error) { if (currentEpoch === epoch && version === searchVersion) toast(error.message); }
    finally { if (currentEpoch === epoch && version === searchVersion) { searching = false; renderTools(); } }
  }
  async function organize() {
    if (!needReady() || !me?.canManagePasswords || organizing) return;
    const started = epoch; await check(true); if (started !== epoch || !config?.enabled || !me?.canManagePasswords) return;
    const pending = new Set(config.pendingIds), photos = filter(state.photos, albumMonth).filter(photo => pending.has(photo.id)).slice(0, 5);
    if (!photos.length) return toast('当前筛选内的照片都已整理，也可以换个月份看看。');
    if (!requestModalClose()) return;
    modal('给回忆分个类');
    form(`<p class="form-help">本次整理当前筛选中的 ${photos.length} 张未完成照片，每批最多 5 张。会发送照片和备注至 ${esc(config.provider)}，保存 AI 生成的描述、标签和分类。可能产生该服务的费用，结果也可能不准确。</p><label class="remember-choice"><input type="checkbox" name="consent" required> 我同意将这 ${photos.length} 张照片和备注交给该 AI 服务分析</label><p id="album-progress" class="form-help" role="status"></p><button type="button" class="text-button" id="album-stop" hidden>完成当前照片后停止</button>`, async data => {
      if (data.get('consent') !== 'on') throw Error('请先确认照片分析。');
      const currentEpoch = epoch; let stopped = false, completed = 0;
      organizing = true; $('#modal').dataset.busy = '1'; $('#album-stop').hidden = false;
      $('#album-stop').onclick = () => { stopped = true; $('#album-stop').disabled = true; };
      try {
        for (const photo of photos) {
          if (stopped || currentEpoch !== epoch) break;
          $('#album-progress').textContent = `正在整理第 ${completed + 1} / ${photos.length} 张……`;
          await api('/api/album-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photo.id, consent: true }) });
          if (currentEpoch !== epoch) return;
          completed++; await refreshNow();
        }
        if (currentEpoch === epoch) { $('#modal').dataset.busy = '0'; close(); toast(`已整理 ${completed} 张照片，结果已保存。`); }
      } catch (error) {
        if (currentEpoch === epoch) $('#album-progress').textContent = `已完成 ${completed} 张。${error.message} 可重试，已完成的不会重复分析。`;
        throw error;
      } finally {
        if (currentEpoch === epoch) { organizing = false; $('#modal').dataset.busy = '0'; $('#album-stop').hidden = true; checkedAt = 0; void check(true); }
      }
    });
    $('#active-form button[type="submit"]').textContent = '确认并开始整理';
  }
  root.LittleDaysAlbum = { filter, renderTools, reset };
  $('#album-query').oninput = event => { searchVersion++; searching = false; query = event.target.value.trim(); matches = null; paint(); };
  $('#album-search-form').onsubmit = event => { event.preventDefault(); searchVersion++; searching = false; query = $('#album-query').value.trim(); matches = null; paint(); };
  $('#album-semantic').onclick = semantic;
  $('#album-search-clear').onclick = () => { searchVersion++; searching = false; query = ''; matches = null; $('#album-query').value = ''; paint(); };
  $('#album-category').onchange = event => { category = event.target.value; paint(); };
  $('#album-organize').onclick = () => organize().catch(error => toast(error.message));
  $('#album-ai-clear').onclick = async () => {
    if (!needReady() || !me?.canManagePasswords || organizing || !confirm('清除所有 AI 描述、标签和索引？原照片和备注会保留。')) return;
    const currentEpoch = epoch;
    try {
      await api('/api/album-ai', { method: 'DELETE' }); if (currentEpoch !== epoch) return;
      matches = null; category = ''; await refreshNow(); await check(true); toast('AI 整理结果已清除，照片仍在相册里。');
    } catch (error) { if (currentEpoch === epoch) toast(error.message); }
  };
  window.addEventListener('little-days-page-change', () => { if (location.hash === '#/album') void check(true); });
  renderTools();
})(globalThis);
