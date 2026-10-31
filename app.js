"use strict";
const $ = s => document.querySelector(s);
const cfg = window.LETTER_CONFIG || {};
const params = new URLSearchParams(location.search);
const storageKey = 'unwritten:mailbox:' + location.pathname;
const status = text => { $('#status').textContent = text; };
let owner = null, mood = '心里话';
try { owner = JSON.parse(localStorage.getItem(storageKey)); } catch {}
const validId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
function show(id) { for (const name of ['configuration','landing','compose','inbox']) $('#' + name).style.display = name === id ? 'block' : 'none'; }
function remember(value) { owner = value; try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { status('浏览器无法保存数据，请立即展开备份区，私下保存管理密钥。'); } }
async function rpc(name, data = {}) {
  let response;
  try { response = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, { method:'POST', headers:{ apikey:cfg.publicKey, Authorization:'Bearer ' + cfg.publicKey, 'Content-Type':'application/json' }, body:JSON.stringify(data), signal:AbortSignal.timeout(20000) }); }
  catch { throw Error('暂时连接不到信箱，请检查网络后重试。'); }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const known = { 'mailbox_not_found':'这个信箱不存在，请检查写信链接。', 'invalid_key':'管理密钥不正确。', 'invalid_letter':'请输入 1 到 5000 字的信件。', 'mailbox_busy':'信箱暂时繁忙，请一分钟后重试。', 'creation_busy':'创建人数较多，请稍后重试。' };
    throw Error(known[payload?.message] || '暂时无法完成，请稍后重试。');
  }
  return payload;
}
function shareURL() { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('box', owner.id); return u.href; }
async function loadInbox() {
  if (!owner || !validId(owner.id)) { show('landing'); return; }
  const rows = await rpc('letter_box_read', { p_id:owner.id, p_key:owner.key });
  show('inbox'); $('#backup-key').textContent = owner.id + ':' + owner.key;
  $('#letters').replaceChildren();
  if (!rows.length) { const p = document.createElement('p'); p.className = 'empty small'; p.textContent = '信箱还是空的。第一份心意，正在路上。'; $('#letters').append(p); }
  for (const row of rows) {
    const article = document.createElement('article'), time = document.createElement('time'), body = document.createElement('p'), del = document.createElement('button');
    article.className = 'letter'; time.textContent = row.mood + ' · ' + new Date(row.created_at).toLocaleString('zh-CN'); body.textContent = row.body; del.textContent = '删除';
    del.onclick = async () => { if (!confirm('确定删除这封信？删除后无法恢复。')) return; del.disabled = true; try { await rpc('letter_delete', { p_id:owner.id, p_key:owner.key, p_letter:row.id }); await loadInbox(); } catch(e) { status(e.message); del.disabled = false; } };
    article.append(time,del,body); $('#letters').append(article);
  }
}
$('#create').onclick = async () => { $('#create').disabled = true; status('正在准备你的信箱……'); try { const box = await rpc('letter_box_create'); remember(box); const u = new URL(location.href); u.search = '?view=inbox'; history.replaceState(null, '', u); status('信箱已创建，请展开备份区保存管理密钥。'); await loadInbox(); } catch(e) { status(e.message); } finally { $('#create').disabled = false; } };
$('#refresh').onclick = () => loadInbox().catch(e => status(e.message));
$('#copy').onclick = async () => { const u = shareURL(); try { await navigator.clipboard.writeText(u); status('写信链接已复制，分享给朋友就能匿名写信。'); } catch { status('长按或选中复制这个写信链接：\n' + u); } };
$('#restore').onclick = () => $('#restore-dialog').showModal();
$('#cancel-restore').onclick = () => $('#restore-dialog').close();
$('#restore-form').onsubmit = async event => { event.preventDefault(); const [id,key] = $('#restore-key').value.trim().split(':'); if (!validId(id) || !/^[0-9a-f]{64}$/i.test(key || '')) { status('请粘贴完整的管理密钥，包含冒号前后的内容。'); return; } try { await rpc('letter_box_read',{p_id:id,p_key:key}); remember({id,key}); $('#restore-key').value = ''; $('#restore-dialog').close(); await loadInbox(); status('信箱已恢复。'); } catch(e) { status(e.message); } };
$('#body').oninput = () => { $('#count').textContent = $('#body').value.length; };
document.querySelectorAll('.mood').forEach(button => { button.onclick = () => { mood = button.dataset.mood; document.querySelectorAll('.mood').forEach(b => b.setAttribute('aria-pressed',String(b === button))); }; });
$('#letter-form').onsubmit = async event => { event.preventDefault(); const body = $('#body').value.trim(); if (!body) { status('先写下你想说的话吧。'); return; } $('#send').disabled = true; status('正在寄出……'); try { await rpc('letter_send',{p_id:params.get('box'),p_body:body,p_mood:mood}); $('#heading').textContent = '你的心意，已送达。'; $('#letter-form').hidden = true; status('信件已保存到对方的私密信箱。'); } catch(e) { status(e.message); $('#send').disabled = false; } };
(async () => {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url || '') || !cfg.publicKey || cfg.publicKey.startsWith('sb_secret_')) { show('configuration'); return; }
  if (params.has('box')) { const id = params.get('box'); show('compose'); $('#send').disabled = true; try { if (!validId(id)) throw Error('写信链接不完整，请向信箱主人索取完整链接。'); await rpc('letter_box_exists',{p_id:id}); $('#send').disabled = false; } catch(e) { status(e.message); } }
  else if (params.get('view') === 'inbox') { try { await loadInbox(); } catch(e) { show('landing'); status(e.message); } }
  else { show('landing'); if (owner?.id) { $('#create').textContent = '打开我的匿名信箱 ↗'; $('#create').onclick = () => { location.search = '?view=inbox'; }; } }
})();
