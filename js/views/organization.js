/* ============================================================================
 * views/organization.js — Organigrama tipo lienzo (estilo Visio)
 * - Cajas colocables y arrastrables sobre un lienzo con paneo y zoom.
 * - Conectores dibujados en SVG entre jefe y dependientes.
 * - Panel lateral retráctil (liquid glass) para crear cajas, editar nombre,
 *   puesto y dependencia, o arrastrar colaboradores existentes al lienzo.
 * - Todo se guarda en la nube (tabla cgp_organigrama).
 * ==========================================================================*/
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;

  const emps = await R.employeeRepository.all();
  const puestos = await R.positionRepository.all();
  const puestoNombre = (e) => (puestos.find((p) => p.id === e.puestoId) || {}).nombre || '';

  // ---------------- Estado ----------------
  const cfg = (await R.orgChartRepository.load()) || {};
  // nodos: { id, nombre, puesto, x, y, parent, empId?, color }
  let nodos = Array.isArray(cfg.nodos) ? cfg.nodos.slice() : [];
  let vista = cfg.vista || { x: 40, y: 30, z: 1 };
  let panelAbierto = cfg.panelAbierto !== false;
  let seleccion = null;

  const COLORES = ['#00216f', '#ff5100', '#7dbfe6', '#f3b24e', '#5db9a3', '#8e7cc3'];
  const NODO_W = 190, NODO_H = 92;
  const uid = () => 'n' + Math.random().toString(36).slice(2, 9);
  const guardar = () => R.orgChartRepository.save({ nodos, vista, panelAbierto });

  // Primera vez: construir desde la jerarquía real (jefe / supervisor).
  if (!nodos.length) nodos = autoGenerar();

  function autoGenerar() {
    const activos = emps.filter((e) => e.estado === 'ACTIVO');
    const porCodigo = new Map(activos.map((e) => [String(e.codigo), e]));
    const jefeDe = (e) => {
      if (e.jefeCodigo && porCodigo.has(String(e.jefeCodigo)) && String(e.jefeCodigo) !== String(e.codigo)) return String(e.jefeCodigo);
      const sup = String(e.supervisorNombre || '').trim().toLowerCase();
      if (sup) { const m = activos.find((x) => String(x.nombreCompleto).trim().toLowerCase() === sup); if (m && m.id !== e.id) return String(m.codigo); }
      return '';
    };
    const idDe = new Map(); activos.forEach((e) => idDe.set(e.id, uid()));
    const hijos = new Map(); const raices = [];
    activos.forEach((e) => {
      const j = jefeDe(e);
      if (j && porCodigo.has(j)) { const p = porCodigo.get(j); if (!hijos.has(p.id)) hijos.set(p.id, []); hijos.get(p.id).push(e); }
      else raices.push(e);
    });
    const out = []; let cursorX = 0;
    const colocar = (e, nivel, parentNodeId) => {
      const kids = hijos.get(e.id) || [];
      let x;
      if (kids.length) {
        const xs = kids.map((k) => colocar(k, nivel + 1, idDe.get(e.id)));
        x = (Math.min(...xs) + Math.max(...xs)) / 2;
      } else { x = cursorX; cursorX += NODO_W + 34; }
      out.push({ id: idDe.get(e.id), nombre: e.nombreCompleto, puesto: puestoNombre(e) || 'Sin puesto',
        x, y: nivel * (NODO_H + 70), parent: parentNodeId || null, empId: e.id, color: COLORES[nivel % COLORES.length] });
      return x;
    };
    raices.forEach((r) => { colocar(r, 0, null); cursorX += 60; });
    return out;
  }

  // ---------------- Render ----------------
  function medidas() {
    if (!nodos.length) return { w: 1200, h: 700 };
    const maxX = Math.max(...nodos.map((n) => n.x)) + NODO_W + 300;
    const maxY = Math.max(...nodos.map((n) => n.y)) + NODO_H + 300;
    return { w: Math.max(1200, maxX), h: Math.max(700, maxY) };
  }

  function conectores() {
    const byId = new Map(nodos.map((n) => [n.id, n]));
    return nodos.filter((n) => n.parent && byId.has(n.parent)).map((n) => {
      const p = byId.get(n.parent);
      const x1 = p.x + NODO_W / 2, y1 = p.y + NODO_H;
      const x2 = n.x + NODO_W / 2, y2 = n.y;
      const my = y1 + (y2 - y1) / 2;
      return `<path d="M${x1},${y1} V${my} H${x2} V${y2}" fill="none" stroke="var(--border)" stroke-width="2" stroke-linecap="round"/>
              <circle cx="${x2}" cy="${y2}" r="3" fill="var(--border)"/>`;
    }).join('');
  }

  async function cajaHTML(n) {
    const emp = n.empId ? emps.find((e) => e.id === n.empId) : null;
    const av = emp ? await U.avatarHTML(emp, 46) : `<span class="avatar" style="width:46px;height:46px;background:${n.color}">${U.esc((n.nombre || '?').slice(0, 1).toUpperCase())}</span>`;
    return `<div class="onode ${seleccion === n.id ? 'is-sel' : ''}" data-n="${n.id}" style="left:${n.x}px;top:${n.y}px;--nc:${n.color}">
      <div class="onode__bar"></div>
      <div class="onode__av">${av}</div>
      <div class="onode__body">
        <b>${U.esc(n.nombre || 'Sin nombre')}</b>
        <span>${U.esc(n.puesto || '')}</span>
      </div>
      <button class="onode__link" data-link="${n.id}" title="Conectar a un jefe">⛓</button>
    </div>`;
  }

  async function pintar() {
    const { w, h } = medidas();
    const cajas = (await Promise.all(nodos.map(cajaHTML))).join('');
    main.innerHTML = `
      <div class="orgwrap ${panelAbierto ? '' : 'orgwrap--collapsed'}">
        <div class="orgcanvas" id="canvas">
          <div class="orgstage" id="stage" style="width:${w}px;height:${h}px;transform:translate(${vista.x}px,${vista.y}px) scale(${vista.z})">
            <svg class="orglines" width="${w}" height="${h}">${conectores()}</svg>
            ${cajas}
          </div>
          <div class="orgtools glass">
            <button class="orgtool" id="zIn" title="Acercar">＋</button>
            <button class="orgtool" id="zOut" title="Alejar">－</button>
            <button class="orgtool" id="zFit" title="Centrar">⤢</button>
          </div>
          <button class="orgtoggle glass" id="togglePanel" title="Mostrar/ocultar panel">${panelAbierto ? '›' : '‹'}</button>
        </div>

        <aside class="orgpanel glass" id="panel">
          <div class="orgpanel__head">
            <img src="assets/brand/pdc-3d.png" alt="" class="orgpanel__logo">
            <div><b>Organigrama</b><span class="muted">Diseña la estructura</span></div>
          </div>

          <div class="orgpanel__scroll">
            <button class="btn btn--primary" id="addBox" style="width:100%;justify-content:center">+ Nueva caja</button>

            <div id="editor"></div>

            <h4 class="form-sec">Colaboradores</h4>
            <p class="muted" style="margin:-4px 0 8px">Arrastra una persona al lienzo para agregarla.</p>
            <input class="input input--search" id="buscarEmp" placeholder="Buscar…" style="margin-bottom:8px">
            <div class="orglist" id="listaEmps"></div>

            <h4 class="form-sec">Acciones</h4>
            <div class="row-gap">
              <button class="btn btn--ghost btn--sm" id="autoBtn">Regenerar automático</button>
              <button class="btn btn--ghost btn--sm" id="clearBtn">Vaciar</button>
            </div>
          </div>
        </aside>
      </div>`;
    await pintarLista();
    pintarEditor();
    wire();
  }

  async function pintarLista(filtro) {
    const cont = main.querySelector('#listaEmps'); if (!cont) return;
    const q = (filtro || '').toLowerCase();
    const usados = new Set(nodos.map((n) => n.empId).filter(Boolean));
    const list = emps.filter((e) => e.estado === 'ACTIVO' && !usados.has(e.id) &&
      (!q || String(e.nombreCompleto).toLowerCase().includes(q)));
    if (!list.length) { cont.innerHTML = '<p class="muted">Todos colocados.</p>'; return; }
    cont.innerHTML = (await Promise.all(list.slice(0, 60).map(async (e) => `
      <div class="orgitem" draggable="true" data-emp="${e.id}">
        ${await U.avatarHTML(e, 28)}
        <div><b>${U.esc(e.nombreCompleto)}</b><span class="muted">${U.esc(puestoNombre(e) || '')}</span></div>
      </div>`))).join('');
    cont.querySelectorAll('.orgitem').forEach((it) => {
      it.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', 'emp:' + it.dataset.emp));
    });
  }

  function pintarEditor() {
    const box = main.querySelector('#editor'); if (!box) return;
    const n = nodos.find((x) => x.id === seleccion);
    if (!n) { box.innerHTML = '<p class="muted" style="margin-top:14px">Selecciona una caja para editarla.</p>'; return; }
    const otros = nodos.filter((x) => x.id !== n.id);
    box.innerHTML = `
      <h4 class="form-sec">Caja seleccionada</h4>
      <label class="f"><span>Nombre</span><input class="input" id="eNombre" value="${U.esc(n.nombre || '')}"></label>
      <label class="f"><span>Puesto</span><input class="input" id="ePuesto" value="${U.esc(n.puesto || '')}"></label>
      <label class="f"><span>Depende de</span>
        <select class="input" id="eParent">
          <option value="">— Nivel superior —</option>
          ${otros.map((o) => `<option value="${o.id}" ${n.parent === o.id ? 'selected' : ''}>${U.esc(o.nombre)}</option>`).join('')}
        </select></label>
      <div class="f"><span>Color</span><div class="swatches">
        ${COLORES.map((c) => `<button class="sw ${n.color === c ? 'is-on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}
      </div></div>
      <div class="row-gap" style="margin-top:10px">
        <button class="btn btn--danger btn--sm" id="delNodo">Eliminar caja</button>
      </div>`;

    const upd = async (patch) => { Object.assign(n, patch); await guardar(); pintar(); };
    box.querySelector('#eNombre').onchange = (ev) => upd({ nombre: ev.target.value });
    box.querySelector('#ePuesto').onchange = (ev) => upd({ puesto: ev.target.value });
    box.querySelector('#eParent').onchange = (ev) => {
      const nuevo = ev.target.value || null;
      if (nuevo && creaCiclo(n.id, nuevo)) { U.toast('Esa dependencia crearía un ciclo', 'warn'); return pintar(); }
      upd({ parent: nuevo });
    };
    box.querySelectorAll('.sw').forEach((b) => b.onclick = () => upd({ color: b.dataset.c }));
    box.querySelector('#delNodo').onclick = async () => {
      if (!(await U.confirm('¿Eliminar esta caja? Sus dependientes subirán un nivel.', { danger: true, ok: 'Eliminar' }))) return;
      nodos.filter((x) => x.parent === n.id).forEach((x) => { x.parent = n.parent; });
      nodos = nodos.filter((x) => x.id !== n.id);
      seleccion = null; await guardar(); pintar();
    };
  }

  function creaCiclo(hijoId, nuevoParent) {
    const byId = new Map(nodos.map((n) => [n.id, n]));
    let cur = nuevoParent, guard = 0;
    while (cur && guard++ < 200) { if (cur === hijoId) return true; cur = (byId.get(cur) || {}).parent; }
    return false;
  }

  // ---------------- Interacción ----------------
  function wire() {
    const canvas = main.querySelector('#canvas');
    const stage = main.querySelector('#stage');
    const aplicarVista = () => { stage.style.transform = `translate(${vista.x}px,${vista.y}px) scale(${vista.z})`; };

    // Paneo del lienzo
    let pan = false, px = 0, py = 0;
    canvas.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.onode') || ev.target.closest('.orgtools') || ev.target.closest('.orgtoggle')) return;
      pan = true; px = ev.clientX; py = ev.clientY; canvas.classList.add('is-pan');
      seleccion = null; main.querySelectorAll('.onode').forEach((c) => c.classList.remove('is-sel')); pintarEditor();
    });
    window.addEventListener('mousemove', (ev) => {
      if (!pan) return; vista.x += ev.clientX - px; vista.y += ev.clientY - py; px = ev.clientX; py = ev.clientY; aplicarVista();
    });
    window.addEventListener('mouseup', () => { if (pan) { pan = false; canvas.classList.remove('is-pan'); guardar(); } });

    // Zoom
    canvas.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault(); vista.z = Math.min(2, Math.max(.35, vista.z - ev.deltaY * .0015)); aplicarVista();
    }, { passive: false });
    main.querySelector('#zIn').onclick = () => { vista.z = Math.min(2, vista.z + .15); aplicarVista(); guardar(); };
    main.querySelector('#zOut').onclick = () => { vista.z = Math.max(.35, vista.z - .15); aplicarVista(); guardar(); };
    main.querySelector('#zFit').onclick = () => { vista = { x: 40, y: 30, z: 1 }; aplicarVista(); guardar(); };

    // Arrastrar cajas
    main.querySelectorAll('.onode').forEach((el) => {
      const n = nodos.find((x) => x.id === el.dataset.n);
      let drag = false, ox = 0, oy = 0;
      el.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('[data-link]')) return;
        ev.stopPropagation(); drag = true; ox = ev.clientX; oy = ev.clientY;
        seleccion = n.id;
        main.querySelectorAll('.onode').forEach((c) => c.classList.toggle('is-sel', c === el));
        pintarEditor(); el.classList.add('is-drag');
      });
      window.addEventListener('mousemove', (ev) => {
        if (!drag) return;
        n.x += (ev.clientX - ox) / vista.z; n.y += (ev.clientY - oy) / vista.z;
        ox = ev.clientX; oy = ev.clientY;
        el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
        main.querySelector('.orglines').innerHTML = conectores();
      });
      window.addEventListener('mouseup', async () => {
        if (!drag) return; drag = false; el.classList.remove('is-drag'); await guardar();
      });
      el.addEventListener('dblclick', () => { if (n.empId) App.UI.navigate('empleados', { id: n.empId }); });
    });

    // Conectar: clic en ⛓ y luego en el jefe
    let enlazando = null;
    main.querySelectorAll('[data-link]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      enlazando = b.dataset.link;
      U.toast('Ahora haz clic en la caja del jefe', 'info');
      main.querySelectorAll('.onode').forEach((c) => {
        if (c.dataset.n === enlazando) return;
        c.classList.add('is-target');
        c.addEventListener('click', async function pick(e2) {
          e2.stopPropagation();
          const hijo = nodos.find((x) => x.id === enlazando);
          if (hijo && !creaCiclo(hijo.id, c.dataset.n)) { hijo.parent = c.dataset.n; await guardar(); }
          else U.toast('Esa dependencia crearía un ciclo', 'warn');
          enlazando = null; pintar();
        }, { once: true });
      });
    });

    // Soltar colaborador desde el panel
    canvas.addEventListener('dragover', (ev) => ev.preventDefault());
    canvas.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const data = ev.dataTransfer.getData('text/plain') || '';
      if (!data.startsWith('emp:')) return;
      const emp = emps.find((e) => e.id === +data.slice(4)); if (!emp) return;
      const r = canvas.getBoundingClientRect();
      nodos.push({ id: uid(), nombre: emp.nombreCompleto, puesto: puestoNombre(emp) || 'Sin puesto',
        x: (ev.clientX - r.left - vista.x) / vista.z - NODO_W / 2,
        y: (ev.clientY - r.top - vista.y) / vista.z - NODO_H / 2,
        parent: null, empId: emp.id, color: COLORES[nodos.length % COLORES.length] });
      await guardar(); pintar();
    });

    // Panel
    main.querySelector('#togglePanel').onclick = async () => { panelAbierto = !panelAbierto; await guardar(); pintar(); };
    main.querySelector('#addBox').onclick = async () => {
      nodos.push({ id: uid(), nombre: 'Nueva caja', puesto: '', x: (-vista.x + 260) / vista.z, y: (-vista.y + 160) / vista.z,
        parent: null, empId: null, color: COLORES[nodos.length % COLORES.length] });
      seleccion = nodos[nodos.length - 1].id;
      await guardar(); pintar();
    };
    const be = main.querySelector('#buscarEmp');
    if (be) be.oninput = () => pintarLista(be.value);
    main.querySelector('#autoBtn').onclick = async () => {
      if (!(await U.confirm('Se reconstruye el organigrama desde los datos de jefatura y se pierde el diseño actual. ¿Continuar?', { ok: 'Regenerar' }))) return;
      nodos = autoGenerar(); seleccion = null; await guardar(); pintar();
    };
    main.querySelector('#clearBtn').onclick = async () => {
      if (!(await U.confirm('¿Vaciar el lienzo por completo?', { danger: true, ok: 'Vaciar' }))) return;
      nodos = []; seleccion = null; await guardar(); pintar();
    };
  }

  await pintar();
  await guardar();
});

/* views/emergency.js — Árbol de emergencia */
App.UI.route('emergencia', async function (main) {
  const R = App.Repos, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => e.estado === 'ACTIVO');
  const conContacto = emps.filter((e) => e.emergencia && e.emergencia.nombre);
  const sinContacto = emps.filter((e) => !(e.emergencia && e.emergencia.nombre));
  const card = async (e) => `<div class="card emg">
    <div class="emg__head">${await U.avatarHTML(e, 40)}<div><b>${U.esc(e.nombreCompleto)}</b><span class="muted">${U.esc(e.celular || '')}</span></div></div>
    <div class="emg__body">
      <div class="fld"><span class="fld__l">Contacto</span><span class="fld__v">${U.esc(e.emergencia.nombre || '—')}</span></div>
      <div class="fld"><span class="fld__l">Parentesco</span><span class="fld__v">${U.esc(e.emergencia.parentesco || '—')}</span></div>
      <div class="fld"><span class="fld__l">Teléfono</span><span class="fld__v">${e.emergencia.telefono ? `<a href="tel:${U.esc(e.emergencia.telefono)}">${U.esc(e.emergencia.telefono)}</a>` : '—'}</span></div>
    </div></div>`;
  main.innerHTML = `<div class="page-head"><h1>Árbol de Emergencia</h1>
      <input id="be" class="input input--search" placeholder="Buscar colaborador…"></div>
    ${sinContacto.length ? `<div class="banner banner--warn">⚠ ${sinContacto.length} colaborador(es) sin contacto de emergencia registrado.</div>` : ''}
    <div id="emgGrid" class="cols cols--3">${(await Promise.all(conContacto.map(card))).join('')}</div>`;
  document.getElementById('be').oninput = (ev) => {
    const q = ev.target.value.toLowerCase();
    main.querySelectorAll('#emgGrid .emg').forEach((c) => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  };
});

/* views/reports.js — Reportes + exportación CSV/XLSX */
App.UI.route('reportes', async function (main) {
  const R = App.Repos, C = App.Calc, U = App.UI;
  const [emps, deptos, puestos] = await Promise.all([R.employeeRepository.all(), R.departmentRepository.all(), R.positionRepository.all()]);
  const depName = Object.fromEntries(deptos.map((d) => [d.id, d.nombre]));
  const posName = Object.fromEntries(puestos.map((d) => [d.id, d.nombre]));
  const activos = emps.filter((e) => e.estado === 'ACTIVO');

  const group = (arr, f) => { const o = {}; arr.forEach((x) => { const k = f(x) || '—'; o[k] = (o[k] || 0) + 1; }); return o; };
  const tabla = (obj) => `<table class="table"><tbody>${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${U.esc(k)}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join('')}</tbody></table>`;

  const dataExport = () => emps.map((e) => ({
    Codigo: e.codigo, CodigoJDE: e.codigoJDE, Nombre: e.nombreCompleto,
    Departamento: depName[e.departamentoId] || '', Puesto: posName[e.puestoId] || '',
    Tipo: e.tipoColaborador, Genero: e.genero, Pais: e.pais,
    FechaIngreso: e.fechaIngreso, Antiguedad: C.antiguedad(e.fechaIngreso).text,
    Edad: C.edad(e.fechaNacimiento), Estado: e.estado, Celular: e.celular,
    CorreoCorporativo: e.correoCorporativo, ContactoEmergencia: e.emergencia && e.emergencia.nombre,
    TelEmergencia: e.emergencia && e.emergencia.telefono,
  }));

  main.innerHTML = `<div class="page-head"><h1>Reportes</h1>
      <div class="row-gap"><button class="btn btn--ghost" id="csvBtn">Exportar CSV</button><button class="btn btn--primary" id="xlsxBtn">Exportar XLSX</button></div></div>
    <div class="cols cols--3">
      <div class="card"><h3 class="card__title">Headcount por departamento</h3>${tabla(group(activos, (e) => depName[e.departamentoId]))}</div>
      <div class="card"><h3 class="card__title">Por puesto</h3>${tabla(group(activos, (e) => posName[e.puestoId]))}</div>
      <div class="card"><h3 class="card__title">Por país</h3>${tabla(group(activos, (e) => e.pais))}</div>
      <div class="card"><h3 class="card__title">Por género</h3>${tabla(group(activos, (e) => e.genero))}</div>
      <div class="card"><h3 class="card__title">Por antigüedad</h3>${tabla(group(activos, (e) => C.CAT_ANTIGUEDAD[C.antiguedad(e.fechaIngreso).categoria]))}</div>
      <div class="card"><h3 class="card__title">Por estado</h3>${tabla(group(emps, (e) => e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'))}</div>
    </div>`;

  document.getElementById('csvBtn').onclick = () => {
    const rows = dataExport(); const heads = Object.keys(rows[0] || { vacio: '' });
    const csv = [heads.join(','), ...rows.map((r) => heads.map((h) => `"${String(r[h] == null ? '' : r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
    dl(new Blob(['\ufeff' + csv], { type: 'text/csv' }), 'reporte-colaboradores.csv');
  };
  document.getElementById('xlsxBtn').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dataExport());
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
    XLSX.writeFile(wb, 'reporte-colaboradores.xlsx');
  };
  function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); U.toast('Reporte exportado'); }
});
