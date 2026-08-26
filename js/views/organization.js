/* views/organization.js — Organigrama por jefe (Nombre/Código de Líder) */
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => e.estado === 'ACTIVO');
  // Construir jerarquía por código de jefe.
  const porCodigo = new Map(emps.map((e) => [String(e.codigo), e]));
  const hijos = new Map(); // codigoJefe -> [emp]
  const raices = [];
  emps.forEach((e) => {
    const jefe = String(e.jefeCodigo || '');
    if (jefe && porCodigo.has(jefe) && jefe !== String(e.codigo)) {
      if (!hijos.has(jefe)) hijos.set(jefe, []);
      hijos.get(jefe).push(e);
    } else { raices.push(e); }
  });

  async function nodo(e, nivel) {
    const kids = hijos.get(String(e.codigo)) || [];
    const sub = kids.length ? `<div class="org__kids">${(await Promise.all(kids.map((k) => nodo(k, nivel + 1)))).join('')}</div>` : '';
    return `<div class="org__node">
      <div class="org__card rowlink" data-id="${e.id}">${await U.avatarHTML(e, 40)}
        <div><b>${U.esc(e.nombreCompleto)}</b><span class="muted">${U.esc(puestoNombre(e))}</span></div>
        ${kids.length ? `<span class="chip">${kids.length}</span>` : ''}</div>${sub}</div>`;
  }
  const puestos = await R.positionRepository.all();
  function puestoNombre(e) { return (puestos.find((p) => p.id === e.puestoId) || {}).nombre || ''; }

  main.innerHTML = `<div class="page-head"><h1>Organización</h1><p class="muted">Organigrama dinámico por jefatura</p></div>
    <div class="org">${(await Promise.all(raices.map((r) => nodo(r, 0)))).join('') || '<p class="muted">Sin datos de jefatura.</p>'}</div>`;
  main.querySelectorAll('.rowlink').forEach((n) => n.onclick = () => App.UI.navigate('empleados', { id: n.dataset.id }));
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
