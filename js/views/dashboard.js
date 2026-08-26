/* views/dashboard.js — Dashboard ejecutivo (todo calculado en vivo) */
App.UI.route('dashboard', async function (main) {
  const R = App.Repos, C = App.Calc, U = App.UI, CH = App.Charts;
  const [emps, deptos] = await Promise.all([R.employeeRepository.all(), R.departmentRepository.all()]);
  const depName = Object.fromEntries(deptos.map((d) => [d.id, d.nombre]));
  const activos = emps.filter((e) => e.estado === 'ACTIVO');
  const hombres = activos.filter((e) => /^m/i.test(e.genero)).length;
  const mujeres = activos.filter((e) => /^f/i.test(e.genero)).length;

  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const mIni = new Date(y, m, 1).toISOString().slice(0, 10);
  const mFin = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  const aIni = new Date(y, 0, 1).toISOString().slice(0, 10);
  const altasMes = C.altasEnRango(emps, mIni, mFin);
  const bajasMes = C.bajasEnRango(emps, mIni, mFin);
  const hcMesIni = C.headcountA(emps, mIni), hcMesFin = C.headcountA(emps, mFin);
  const rotMes = C.rotacion(hcMesIni, hcMesFin, bajasMes).pct;
  const hcAnioIni = C.headcountA(emps, aIni), hcAnioFin = activos.length;
  const bajasAnio = C.bajasEnRango(emps, aIni, mFin);
  const rotAcum = C.rotacion(hcAnioIni, hcAnioFin, bajasAnio).pct;

  const antigProm = activos.length
    ? Math.round(activos.reduce((s, e) => s + C.antiguedad(e.fechaIngreso).totalDays, 0) / activos.length / 365.25 * 10) / 10 : 0;
  const cumple = C.cumpleClasificados(activos);
  const ubic = (u) => activos.filter((e) => e.ubicacionActual === u).length;

  // Distribución por departamento
  const porDepto = {};
  activos.forEach((e) => { const n = depName[e.departamentoId] || 'Sin asignar'; porDepto[n] = (porDepto[n] || 0) + 1; });
  const depData = Object.entries(porDepto).map(([label, value]) => ({ label, value }));

  // Headcount histórico (últimos 12 meses)
  const hist = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - i + 1, 0);
    hist.push({ label: d.toLocaleDateString('es', { month: 'short' }), value: C.headcountA(emps, d.toISOString().slice(0, 10)) });
  }
  // Antigüedad por categoría
  const catCount = {};
  activos.forEach((e) => { const k = C.antiguedad(e.fechaIngreso).categoria; catCount[k] = (catCount[k] || 0) + 1; });
  const antigData = Object.keys(C.CAT_ANTIGUEDAD).filter((k) => catCount[k]).map((k) => ({ label: C.CAT_ANTIGUEDAD[k].replace('Menos de ', '<').replace('Más de ', '>'), value: catCount[k] }));

  const kpi = (val, lbl, cls) => `<div class="kpi ${cls || ''}"><div class="kpi__val">${val}</div><div class="kpi__lbl">${lbl}</div></div>`;

  main.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p class="muted">Panorama del personal · ${now.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      <button class="btn btn--primary" onclick="location.hash='#empleados'">Ver colaboradores</button></div>
    ${activos.length === 0 ? emptyState() : ''}
    <div class="kpi-grid">
      ${kpi(activos.length, 'Activos', 'kpi--primary')}
      ${kpi(hombres, 'Hombres')}
      ${kpi(mujeres, 'Mujeres')}
      ${kpi(altasMes, 'Altas del mes', 'kpi--good')}
      ${kpi(bajasMes, 'Bajas del mes', 'kpi--bad')}
      ${kpi(rotMes + '%', 'Rotación mes')}
      ${kpi(rotAcum + '%', 'Rotación acum.')}
      ${kpi(antigProm + ' a', 'Antig. promedio')}
      ${kpi(cumple.mes.length, 'Cumple. del mes', 'kpi--accent')}
      ${kpi(cumple.proximos.length, 'Próx. cumpleaños')}
    </div>

    <div class="cols cols--3" style="margin-top:8px">
      ${kpi(ubic('EN_SITIO'), 'En sitio')}
      ${kpi(ubic('REMOTO'), 'Remoto')}
      ${kpi(ubic('VACACIONES') , 'Vacaciones')}
      ${kpi(ubic('PERMISO'), 'Permisos')}
      ${kpi(ubic('INCAPACIDAD'), 'Incapacidad')}
      ${kpi(ubic('AUSENTE'), 'Ausentes')}
    </div>

    <div class="cols cols--2" style="margin-top:16px">
      <div class="card"><h3 class="card__title">Personal por departamento</h3>${CH.donut(depData, { centerLabel: 'activos' })}</div>
      <div class="card"><h3 class="card__title">Headcount histórico (12 meses)</h3>${CH.line(hist)}</div>
    </div>
    <div class="cols cols--2" style="margin-top:16px">
      <div class="card"><h3 class="card__title">Antigüedad por rango</h3>${CH.bars(antigData)}</div>
      <div class="card"><h3 class="card__title">Cumpleaños próximos</h3>${await proximosHTML(cumple.proximos.slice(0, 6))}</div>
    </div>`;

  function emptyState() {
    return `<div class="empty"><h3>Aún no hay colaboradores</h3><p>Importa el Excel para comenzar. Los datos se guardan localmente en tu navegador.</p>
      <button class="btn btn--primary" onclick="location.hash='#configuracion'">Ir a Importar</button></div>`;
  }
  async function proximosHTML(list) {
    if (!list.length) return '<p class="muted">Sin cumpleaños en los próximos 30 días.</p>';
    const rows = await Promise.all(list.map(async (i) => `<div class="mini-row">${await U.avatarHTML(i.colaborador, 34)}
      <div><b>${U.esc(i.colaborador.nombreCompleto)}</b><span class="muted">${i.fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · ${i.edad + 1} años</span></div>
      <span class="chip">${i.diffDays === 0 ? 'Hoy' : 'en ' + i.diffDays + 'd'}</span></div>`));
    return rows.join('');
  }
});
