/* views/organization.js — Organigrama: automático por jefatura + edición manual.
 * Los ajustes manuales (reasignar jefe, ocultar, orden) se guardan en la nube y
 * tienen prioridad sobre lo que venga del Excel. */
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;
  const todos = await R.employeeRepository.all();
  const puestos = await R.positionRepository.all();
  const puestoNombre = (e) => (puestos.find((p) => p.id === e.puestoId) || {}).nombre || '';

  const cfg = (await R.orgChartRepository.load()) || {};
  const overrides = cfg.overrides || {};   // { empId: codigoJefe | '' (raíz) }
  const ocultos = new Set(cfg.ocultos || []);
  let modoEdicion = false;

  const emps = todos.filter((e) => e.estado === 'ACTIVO' && !ocultos.has(e.id));
  const porCodigo = new Map(emps.map((e) => [String(e.codigo), e]));
  const porId = new Map(todos.map((e) => [e.id, e]));

  // Jefe efectivo: override manual > código de líder > supervisor por nombre.
  function jefeDe(e) {
    if (Object.prototype.hasOwnProperty.call(overrides, e.id)) return String(overrides[e.id] || '');
    if (e.jefeCodigo && porCodigo.has(String(e.jefeCodigo))) return String(e.jefeCodigo);
    const sup = String(e.supervisorNombre || '').trim().toLowerCase();
    if (sup) {
      const m = emps.find((x) => String(x.nombreCompleto || '').trim().toLowerCase() === sup);
      if (m && m.id !== e.id) return String(m.codigo);
    }
    return '';
  }

  function construir() {
    const hijos = new Map(); const raices = [];
    emps.forEach((e) => {
      const j = jefeDe(e);
      if (j && porCodigo.has(j) && j !== String(e.codigo)) {
        if (!hijos.has(j)) hijos.set(j, []);
        hijos.get(j).push(e);
      } else raices.push(e);
    });
    // Evitar ciclos: si un nodo es su propio ancestro, se sube a raíz.
    const seguro = (e, vistos) => {
      const j = jefeDe(e);
      if (!j || !porCodigo.has(j)) return true;
      if (vistos.has(j)) return false;
      vistos.add(j);
      return seguro(porCodigo.get(j), vistos);
    };
    emps.forEach((e) => {
      if (!seguro(e, new Set([String(e.codigo)]))) {
        const j = jefeDe(e);
        const arr = hijos.get(j); if (arr) hijos.set(j, arr.filter((x) => x.id !== e.id));
        if (!raices.includes(e)) raices.push(e);
      }
    });
    const cuenta = (e) => { const k = hijos.get(String(e.codigo)) || []; return k.reduce((s, x) => s + 1 + cuenta(x), 0); };
    raices.sort((a, b) => cuenta(b) - cuenta(a));
    return { hijos, raices };
  }

  async function nodo(e, hijos) {
    const kids = (hijos.get(String(e.codigo)) || []).slice().sort((a, b) => String(a.nombreCompleto).localeCompare(String(b.nombreCompleto)));
    const sub = kids.length ? `<div class="org__kids">${(await Promise.all(kids.map((k) => nodo(k, hijos)))).join('')}</div>` : '';
    return `<div class="org__node">
      <div class="org__card ${modoEdicion ? 'org__card--edit' : ''}" data-id="${e.id}" ${modoEdicion ? 'draggable="true"' : ''}>
        ${await U.avatarHTML(e, 42)}
        <div class="org__txt"><b>${U.esc(e.nombreCompleto)}</b><span class="muted">${U.esc(puestoNombre(e) || 'Sin puesto')}</span></div>
        ${kids.length ? `<span class="org__count" title="${kids.length} a cargo">${kids.length}</span>` : ''}
        ${modoEdicion ? `<button class="org__x" data-raiz="${e.id}" title="Mover a nivel superior">⤴</button>` : ''}
      </div>${sub}</div>`;
  }

  async function pintar() {
    const { hijos, raices } = construir();
    const cuerpo = raices.length
      ? (await Promise.all(raices.map((r) => nodo(r, hijos)))).join('')
      : '<div class="empty"><h3>Sin jerarquía definida</h3><p>Activa “Editar organigrama” y arrastra a cada persona sobre su jefe.</p></div>';
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Organización</h1><p class="muted">${modoEdicion ? 'Arrastra una tarjeta sobre otra para asignar jefe · ⤴ la sube a nivel superior' : 'Organigrama por jefatura'}</p></div>
        <div class="row-gap">
          <button class="btn ${modoEdicion ? 'btn--good' : 'btn--ghost'}" id="edBtn">${modoEdicion ? '✓ Listo' : '✎ Editar organigrama'}</button>
          ${modoEdicion ? '<button class="btn btn--ghost" id="resetBtn">Restablecer</button>' : ''}
        </div>
      </div>
      <div class="org">${cuerpo}</div>`;
    wire();
  }

  function wire() {
    main.querySelector('#edBtn').onclick = () => { modoEdicion = !modoEdicion; pintar(); };
    const rb = main.querySelector('#resetBtn');
    if (rb) rb.onclick = async () => {
      if (!(await U.confirm('Se descartan los ajustes manuales y el organigrama vuelve a construirse desde los datos de jefatura. ¿Continuar?', { ok: 'Restablecer' }))) return;
      for (const k of Object.keys(overrides)) delete overrides[k];
      ocultos.clear();
      await guardar(); U.toast('Organigrama restablecido', 'ok'); pintar();
    };

    main.querySelectorAll('.org__card').forEach((c) => {
      const id = +c.dataset.id;
      if (!modoEdicion) { c.onclick = () => App.UI.navigate('empleados', { id }); return; }

      c.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', String(id)); c.classList.add('is-drag'); });
      c.addEventListener('dragend', () => c.classList.remove('is-drag'));
      c.addEventListener('dragover', (ev) => { ev.preventDefault(); c.classList.add('is-over'); });
      c.addEventListener('dragleave', () => c.classList.remove('is-over'));
      c.addEventListener('drop', async (ev) => {
        ev.preventDefault(); c.classList.remove('is-over');
        const arrastrado = +ev.dataTransfer.getData('text/plain');
        if (!arrastrado || arrastrado === id) return;
        const hijo = porId.get(arrastrado), jefe = porId.get(id);
        if (!hijo || !jefe) return;
        overrides[hijo.id] = String(jefe.codigo);
        await guardar();
        await R.employeeRepository.update(hijo.id, { jefeNombre: jefe.nombreCompleto, jefeCodigo: String(jefe.codigo) });
        U.toast(`${hijo.nombreCompleto.split(' ')[0]} ahora reporta a ${jefe.nombreCompleto.split(' ')[0]}`, 'ok');
        pintar();
      });
    });

    main.querySelectorAll('[data-raiz]').forEach((b) => b.onclick = async (ev) => {
      ev.stopPropagation();
      const e = porId.get(+b.dataset.raiz); if (!e) return;
      overrides[e.id] = '';
      await guardar();
      await R.employeeRepository.update(e.id, { jefeCodigo: '', jefeNombre: '' });
      U.toast('Movido a nivel superior', 'ok'); pintar();
    });
  }

  const guardar = () => R.orgChartRepository.save({ overrides, ocultos: Array.from(ocultos) });
  await pintar();
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
