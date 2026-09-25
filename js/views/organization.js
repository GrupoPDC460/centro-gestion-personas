/* ============================================================================
 * views/organization.js — Organigrama dinámico con drill-down
 * Se construye automáticamente desde los colaboradores y su "jefe directo".
 * Ligado a Colaboradores: al agregar/editar/inactivar personas, se refleja.
 * Niveles: Erwin → Grupos (Cobros/Créditos/Liquidaciones) → Sub-áreas → Árbol.
 * ==========================================================================*/
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => (e.estado || 'ACTIVO') === 'ACTIVO');

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const clean = (v) => (v && String(v).trim() && String(v).trim() !== '0') ? String(v).trim() : '';

  // Índice por nombre para resolver "jefeNombre" → persona
  const porNombre = new Map();
  emps.forEach((e) => porNombre.set(norm(e.nombreCompleto), e));

  // Hijos de cada persona (quién le reporta directo)
  const hijos = new Map();
  emps.forEach((e) => {
    const jefe = porNombre.get(norm(e.jefeNombre));
    if (jefe && jefe.id !== e.id) {
      if (!hijos.has(jefe.id)) hijos.set(jefe.id, []);
      hijos.get(jefe.id).push(e);
    }
  });

  // Área de cada persona (real). Si está vacía, hereda del jefe.
  const areaDe = (e) => {
    let a = clean(e.areaFinalReal);
    if (a) return a;
    const jefe = porNombre.get(norm(e.jefeNombre));
    return jefe ? clean(jefe.areaFinalReal) : '';
  };

  // Agrupación de sub-área → grupo
  const grupoDeArea = (a) => {
    const x = norm(a);
    if (/liquidaci/.test(x)) return 'Liquidaciones';
    if (/cr[eé]dito|cartera|operaci/.test(x)) return 'Créditos';
    if (/venta directa|glt|moderno|kam|distribuidor|cobro/.test(x)) return 'Cobros';
    return 'Otros';
  };

  // Raíz: el líder principal (rol Liderazgo cuyo jefe no está en el set, o "Créditos y Cobros")
  let raiz = emps.find((e) => norm(e.areaFinalReal) === 'créditos y cobros' && clean(e.titulo).toLowerCase().includes('líder'))
          || emps.find((e) => (e.rol === 'Liderazgo') && !porNombre.get(norm(e.jefeNombre)))
          || emps[0];

  // Reportes directos del líder → sub-áreas
  const reportesRaiz = (hijos.get(raiz && raiz.id) || []).concat(
    // personas cuyo jefe es la raíz por lider directo pero jefeNombre vacío
    emps.filter((e) => e.id !== (raiz && raiz.id) && !clean(e.jefeNombre) && norm(e.ultimoLiderNombre) === norm(raiz && raiz.nombreCompleto))
  );

  // Estado de navegación
  const st = { nivel: 'root', grupo: null, subLiderId: null };

  main.innerHTML = `<div class="page-head"><div><h1>Organigrama</h1><p class="muted">Se actualiza automáticamente con Colaboradores</p></div></div>
    <div id="orgBread" class="filters" style="margin-bottom:12px"></div>
    <div id="orgCanvas"></div>`;

  function card(e, sub, extra) {
    const av = e ? '' : '';
    return `<div class="orgcard ${extra || ''}" ${e ? `data-emp="${e.id}"` : ''}>
      <div class="orgcard__name">${U.esc(e ? e.nombreCompleto : sub)}</div>
      ${sub && e ? `<div class="orgcard__sub">${U.esc(sub)}</div>` : ''}
    </div>`;
  }

  async function pintar() {
    const bread = document.getElementById('orgBread');
    const canvas = document.getElementById('orgCanvas');

    // Breadcrumb
    let bc = `<button class="btn btn--ghost btn--sm" data-nav="root">Inicio</button>`;
    if (st.grupo) bc += ` <span class="muted">›</span> <button class="btn btn--ghost btn--sm" data-nav="grupo">${U.esc(st.grupo)}</button>`;
    if (st.subLiderId) { const l = emps.find((e) => e.id === st.subLiderId); bc += ` <span class="muted">›</span> <span class="chip">${U.esc(l ? areaDe(l) : '')}</span>`; }
    bread.innerHTML = bc;

    if (st.nivel === 'root') {
      // Líder + grupos
      const grupos = ['Cobros', 'Créditos', 'Liquidaciones'];
      const cont = {};
      reportesRaiz.forEach((r) => { const g = grupoDeArea(areaDe(r)); cont[g] = (cont[g] || 0) + 1 + contarSub(r); });
      canvas.innerHTML = `
        <div class="org-top">${await bigCard(raiz, 'Líder de Créditos y Cobros', 'org-lider')}</div>
        <div class="org-groups">
          ${grupos.map((g) => `<button class="org-group" data-grupo="${U.esc(g)}">
            <span class="org-group__ico"><i class="ti ti-folders"></i></span>
            <span class="org-group__name">${g}</span>
            <span class="org-group__meta">${subareasDe(g).length} sub-áreas</span>
          </button>`).join('')}
        </div>`;
    } else if (st.nivel === 'grupo') {
      // Sub-áreas del grupo → cada una con su líder
      const subs = subareasDe(st.grupo);
      canvas.innerHTML = `<div class="org-subs">${subs.map((s) => {
        const lider = s.lider;
        return `<button class="org-sub" data-sublider="${lider ? lider.id : ''}" data-area="${U.esc(s.area)}">
          <span class="org-sub__name">${U.esc(s.area)}</span>
          <span class="org-sub__lead">${lider ? U.esc(lider.nombreCompleto) : 'Sin líder asignado'}</span>
          <span class="org-sub__count">${s.total} personas</span>
        </button>`;
      }).join('')}</div>`;
    } else if (st.nivel === 'sub') {
      const lider = emps.find((e) => e.id === st.subLiderId);
      canvas.innerHTML = `<div class="org-tree">${await arbolHTML(lider)}</div>`;
    }

    // Eventos
    canvas.querySelectorAll('[data-grupo]').forEach((b) => b.onclick = () => { st.nivel = 'grupo'; st.grupo = b.dataset.grupo; st.subLiderId = null; pintar(); });
    canvas.querySelectorAll('[data-sublider]').forEach((b) => b.onclick = () => { st.nivel = 'sub'; st.subLiderId = b.dataset.sublider; pintar(); });
    canvas.querySelectorAll('[data-emp]').forEach((c) => c.onclick = () => App.UI.navigate('empleados', { id: c.dataset.emp }));
    bread.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      if (b.dataset.nav === 'root') { st.nivel = 'root'; st.grupo = null; st.subLiderId = null; }
      if (b.dataset.nav === 'grupo') { st.nivel = 'grupo'; st.subLiderId = null; }
      pintar();
    });
  }

  function contarSub(e) { const h = hijos.get(e.id) || []; return h.reduce((n, c) => n + 1 + contarSub(c), 0); }

  function subareasDe(grupo) {
    // Agrupa a los reportes de la raíz (y sus árboles) por área, dentro del grupo
    const mapa = new Map();
    reportesRaiz.forEach((r) => {
      const area = areaDe(r);
      if (grupoDeArea(area) !== grupo) return;
      if (!mapa.has(area)) mapa.set(area, { area, lider: r, total: 0 });
      mapa.get(area).total += 1 + contarSub(r);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }

  async function bigCard(e, sub, cls) {
    if (!e) return '';
    return `<div class="orgcard orgcard--big ${cls || ''}" data-emp="${e.id}">
      ${await U.avatarHTML(e, 48)}
      <div><div class="orgcard__name">${U.esc(e.nombreCompleto)}</div>
      <div class="orgcard__sub">${U.esc(sub || '')}</div></div>
    </div>`;
  }

  async function arbolHTML(e) {
    if (!e) return '<p class="muted">Sin datos.</p>';
    const h = (hijos.get(e.id) || []).slice().sort((a, b) => U.esc(a.nombreCompleto).localeCompare(b.nombreCompleto));
    const nodo = `<div class="tnode">
      <div class="orgcard orgcard--big" data-emp="${e.id}">${await U.avatarHTML(e, 44)}
        <div><div class="orgcard__name">${U.esc(e.nombreCompleto)}</div>
        <div class="orgcard__sub">${U.esc((puestoSub(e)) )}</div></div>
      </div>
      ${h.length ? `<div class="tchildren">${(await Promise.all(h.map(arbolHTML))).join('')}</div>` : ''}
    </div>`;
    return nodo;
  }

  function puestoSub(e) { return clean(e.titulo) || areaDe(e) || ''; }

  await pintar();
});
