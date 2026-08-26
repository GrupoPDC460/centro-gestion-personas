/* ============================================================================
 * ui.js — Framework mínimo de UI: router hash, toasts, modales, tema,
 * helpers de formato, avatares, backup/restore.
 * ==========================================================================*/
window.App = window.App || {};

App.UI = (function () {
  // ---------- Helpers de formato ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fechaCorta = (iso) => { const d = App.Calc.parseDate(iso); return d ? d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
  const iniciales = (nombre) => (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const colorFor = (str) => { let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; };

  // ---------- Toasts ----------
  function toast(msg, tipo) {
    const cont = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast toast--' + (tipo || 'ok');
    const icon = { ok: '✓', warn: '⚠', err: '✕', info: 'ℹ' }[tipo || 'ok'] || '✓';
    el.innerHTML = `<span class="toast__icon">${icon}</span><span>${esc(msg)}</span>`;
    cont.appendChild(el);
    setTimeout(() => { el.classList.add('toast--out'); setTimeout(() => el.remove(), 300); }, 3200);
  }

  // ---------- Modales ----------
  function modal(html, opts) {
    opts = opts || {};
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${opts.wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal__head"><h3>${esc(opts.title || '')}</h3><button class="modal__x" aria-label="Cerrar">✕</button></div>
      <div class="modal__body">${html}</div>
      <div class="modal__foot"></div></div>`;
    document.body.appendChild(back);
    const close = () => { back.classList.add('modal-back--out'); setTimeout(() => back.remove(), 200); };
    back.querySelector('.modal__x').onclick = close;
    back.onclick = (e) => { if (e.target === back && opts.dismissable !== false) close(); };
    const foot = back.querySelector('.modal__foot');
    (opts.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.variant ? 'btn--' + b.variant : 'btn--ghost');
      btn.textContent = b.label;
      btn.onclick = () => { const keep = b.onClick && b.onClick(back); if (!keep) close(); };
      foot.appendChild(btn);
    });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
    return { el: back, close };
  }

  function confirm(msg, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      modal(`<p class="confirm-text">${esc(msg)}</p>`, {
        title: opts.title || 'Confirmar',
        buttons: [
          { label: opts.cancel || 'Cancelar', variant: 'ghost', onClick: () => resolve(false) },
          { label: opts.ok || 'Aceptar', variant: opts.danger ? 'danger' : 'primary', onClick: () => resolve(true) },
        ],
      });
    });
  }

  // ---------- Avatares (foto o iniciales) ----------
  async function avatarHTML(colaborador, size) {
    size = size || 40;
    const foto = await App.Repos.photoRepository.get(colaborador.id);
    if (foto && foto.dataUrl) {
      return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${foto.dataUrl}" alt=""></span>`;
    }
    return `<span class="avatar avatar--txt" style="width:${size}px;height:${size}px;background:${colorFor(colaborador.nombreCompleto)};font-size:${size * 0.38}px">${esc(iniciales(colaborador.nombreCompleto))}</span>`;
  }

  // ---------- Router ----------
  const routes = {};
  function route(name, fn) { routes[name] = fn; }
  async function navigate(name, params) {
    if (name) location.hash = '#' + name + (params ? '?' + new URLSearchParams(params) : '');
  }
  async function render() {
    const raw = (location.hash || '#dashboard').slice(1);
    const [name, qs] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    document.querySelectorAll('.nav__item').forEach((a) => a.classList.toggle('nav__item--active', a.dataset.route === name));
    const view = routes[name] || routes['dashboard'];
    const main = document.getElementById('view');
    main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try { await view(main, params); } catch (e) { console.error(e); main.innerHTML = `<div class="empty"><h3>Error al cargar la vista</h3><p>${esc(e.message)}</p></div>`; }
    main.scrollTop = 0;
    document.getElementById('sidebar').classList.remove('sidebar--open');
  }

  // ---------- Tema ----------
  async function initTheme() {
    let t = await App.Repos.settingsRepository.get('theme');
    if (!t) t = 'dark';
    setTheme(t);
  }
  async function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    await App.Repos.settingsRepository.set('theme', t);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
  }
  async function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    await setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  // ---------- Backup / Restore ----------
  async function backup() {
    const stores = ['colaboradores', 'fotos', 'movimientos', 'departamentos', 'puestos', 'tiposColaborador', 'catalogos', 'auditoria', 'config'];
    const dump = { _meta: { app: 'centro-gestion-personas', version: 1, fecha: new Date().toISOString() } };
    for (const s of stores) dump[s] = await App.DB.getAll(s);
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `respaldo-cgp-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('Respaldo descargado', 'ok');
  }
  async function restore(file) {
    const text = await file.text();
    const dump = JSON.parse(text);
    if (!dump._meta || dump._meta.app !== 'centro-gestion-personas') throw new Error('Archivo de respaldo no válido');
    await App.DB.clearAll();
    for (const [store, rows] of Object.entries(dump)) {
      if (store === '_meta' || !Array.isArray(rows)) continue;
      if (rows.length) await App.DB.bulkPut(store, rows);
    }
    toast('Respaldo restaurado', 'ok');
  }

  return { esc, fechaCorta, iniciales, colorFor, toast, modal, confirm, avatarHTML, route, navigate, render, initTheme, setTheme, toggleTheme, backup, restore };
})();
