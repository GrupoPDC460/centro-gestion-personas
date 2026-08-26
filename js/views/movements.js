/* views/movements.js — Altas y Bajas (históricos + gráfico mensual) */
App.UI.route('altas-bajas', async function (main) {
  const R = App.Repos, C = App.Calc, U = App.UI, CH = App.Charts;
  const emps = await R.employeeRepository.all();
  const now = new Date(), y = now.getFullYear();

  const mesesLbl = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const serie = mesesLbl.map((lbl, m) => {
    const d = new Date(y, m, 1).toISOString().slice(0, 10), h = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { label: lbl, value: C.altasEnRango(emps, d, h), value2: C.bajasEnRango(emps, d, h) };
  });
  const q = (from, to) => ({ altas: C.altasEnRango(emps, from, to), bajas: C.bajasEnRango(emps, from, to) });
  const mIni = new Date(y, now.getMonth(), 1).toISOString().slice(0, 10), mFin = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const trimIni = new Date(y, Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
  const anioIni = new Date(y, 0, 1).toISOString().slice(0, 10), anioFin = new Date(y, 11, 31).toISOString().slice(0, 10);
  const mm = q(mIni, mFin), tt = q(trimIni, mFin), aa = q(anioIni, anioFin);

  // listado altas/bajas del año
  const altas = emps.filter((e) => { const i = C.parseDate(e.fechaIngreso); return i && i.getFullYear() === y; }).sort((a, b) => (b.fechaIngreso || '').localeCompare(a.fechaIngreso));
  const bajas = emps.filter((e) => { const b = C.parseDate(e.fechaBaja); return b && b.getFullYear() === y; }).sort((a, b) => (b.fechaBaja || '').localeCompare(a.fechaBaja));

  const row = async (e, campo) => `<tr class="rowlink" data-id="${e.id}"><td class="cell-person">${await U.avatarHTML(e, 32)}<b>${U.esc(e.nombreCompleto)}</b></td><td>${U.esc(e.codigo)}</td><td>${U.fechaCorta(e[campo])}</td></tr>`;

  main.innerHTML = `
    <div class="page-head"><h1>Altas y Bajas</h1></div>
    <div class="kpi-grid">
      <div class="kpi kpi--good"><div class="kpi__val">${mm.altas}</div><div class="kpi__lbl">Altas del mes</div></div>
      <div class="kpi"><div class="kpi__val">${tt.altas}</div><div class="kpi__lbl">Altas del trimestre</div></div>
      <div class="kpi"><div class="kpi__val">${aa.altas}</div><div class="kpi__lbl">Altas del año</div></div>
      <div class="kpi kpi--bad"><div class="kpi__val">${mm.bajas}</div><div class="kpi__lbl">Bajas del mes</div></div>
      <div class="kpi"><div class="kpi__val">${tt.bajas}</div><div class="kpi__lbl">Bajas del trimestre</div></div>
      <div class="kpi"><div class="kpi__val">${aa.bajas}</div><div class="kpi__lbl">Bajas del año</div></div>
    </div>
    <div class="card" style="margin-top:16px"><h3 class="card__title">Altas vs Bajas ${y} <span class="lg"><span class="lg__dot" style="background:${CH.PAL[0]}"></span>Altas <span class="lg__dot" style="background:${CH.PAL[1]}"></span>Bajas</span></h3>${CH.bars(serie, { dual: true })}</div>
    <div class="cols cols--2" style="margin-top:16px">
      <div class="card"><h3 class="card__title">Altas ${y} (${altas.length})</h3><div class="table-wrap">${altas.length ? `<table class="table"><tbody>${(await Promise.all(altas.map((e) => row(e, 'fechaIngreso')))).join('')}</tbody></table>` : '<p class="muted">Sin altas este año.</p>'}</div></div>
      <div class="card"><h3 class="card__title">Bajas ${y} (${bajas.length})</h3><div class="table-wrap">${bajas.length ? `<table class="table"><tbody>${(await Promise.all(bajas.map((e) => row(e, 'fechaBaja')))).join('')}</tbody></table>` : '<p class="muted">Sin bajas este año.</p>'}</div></div>
    </div>`;
  main.querySelectorAll('.rowlink').forEach((tr) => tr.onclick = () => App.UI.navigate('empleados', { id: tr.dataset.id }));
});

/* views/turnover.js — Rotación */
App.UI.route('rotacion', async function (main) {
  const R = App.Repos, C = App.Calc, CH = App.Charts;
  const emps = await R.employeeRepository.all();
  const now = new Date(), y = now.getFullYear();
  const st = { modo: 'anio' };

  function rango() {
    if (st.modo === 'mes') return [new Date(y, now.getMonth(), 1), new Date(y, now.getMonth() + 1, 0)];
    if (st.modo === 'trim') { const q = Math.floor(now.getMonth() / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 0)]; }
    if (st.modo === 'sem') { const s = now.getMonth() < 6 ? 0 : 6; return [new Date(y, s, 1), new Date(y, s + 6, 0)]; }
    return [new Date(y, 0, 1), new Date(y, 11, 31)];
  }

  function pintar() {
    const [d1, d2] = rango();
    const from = d1.toISOString().slice(0, 10), to = d2.toISOString().slice(0, 10);
    const hcI = C.headcountA(emps, from), hcF = C.headcountA(emps, to);
    const bajas = C.bajasEnRango(emps, from, to), altas = C.altasEnRango(emps, from, to);
    const rot = C.rotacion(hcI, hcF, bajas);
    // rotación mensual histórica del año
    const serieRot = [], serieBaja = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const a = new Date(y, m, 1).toISOString().slice(0, 10), b = new Date(y, m + 1, 0).toISOString().slice(0, 10);
      const r = C.rotacion(C.headcountA(emps, a), C.headcountA(emps, b), C.bajasEnRango(emps, a, b));
      serieRot.push({ label: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][m], value: r.pct });
    }
    document.getElementById('rotOut').innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi__val">${hcI}</div><div class="kpi__lbl">Headcount inicial</div></div>
        <div class="kpi"><div class="kpi__val">${hcF}</div><div class="kpi__lbl">Headcount final</div></div>
        <div class="kpi kpi--good"><div class="kpi__val">${altas}</div><div class="kpi__lbl">Altas</div></div>
        <div class="kpi kpi--bad"><div class="kpi__val">${bajas}</div><div class="kpi__lbl">Bajas</div></div>
        <div class="kpi"><div class="kpi__val">${rot.promedio}</div><div class="kpi__lbl">Promedio</div></div>
        <div class="kpi kpi--primary"><div class="kpi__val">${rot.pct}%</div><div class="kpi__lbl">Rotación</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3 class="card__title">Rotación mensual ${y} (%)</h3>${CH.line(serieRot)}</div>`;
  }

  main.innerHTML = `<div class="page-head"><h1>Rotación</h1></div>
    <div class="toolbar"><label class="muted">Período:</label>
      <select id="modo" class="input">
        <option value="mes">Mes</option><option value="trim">Trimestre</option><option value="sem">Semestre</option><option value="anio" selected>Año</option>
      </select>
      <span class="muted">Fórmula: bajas ÷ promedio de plantilla × 100</span></div>
    <div id="rotOut"></div>`;
  document.getElementById('modo').onchange = (e) => { st.modo = e.target.value; pintar(); };
  pintar();
});

/* views/birthdays.js — Cumpleaños */
App.UI.route('cumpleanos', async function (main) {
  const R = App.Repos, C = App.Calc, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => e.estado === 'ACTIVO');
  const cum = C.cumpleClasificados(emps);
  const card = async (i) => `<div class="bday">${await U.avatarHTML(i.colaborador, 48)}
    <div><b>${U.esc(i.colaborador.nombreCompleto)}</b><span class="muted">${i.fecha.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'long' })} · cumple ${i.edad + 1}</span></div>
    <span class="chip">${i.diffDays === 0 ? '🎂 Hoy' : 'en ' + i.diffDays + ' d'}</span></div>`;
  const bloque = async (t, list, emo) => `<div class="card"><h3 class="card__title">${emo} ${t} <span class="chip">${list.length}</span></h3>${list.length ? (await Promise.all(list.map(card))).join('') : '<p class="muted">Ninguno.</p>'}</div>`;
  main.innerHTML = `<div class="page-head"><h1>Cumpleaños</h1></div>
    <div class="cols cols--2">
      ${await bloque('Hoy', cum.hoy, '🎉')}
      ${await bloque('Esta semana', cum.semana, '📅')}
    </div>
    <div class="cols cols--2" style="margin-top:16px">
      ${await bloque('Este mes', cum.mes, '🗓️')}
      ${await bloque('Próximos 30 días', cum.proximos, '⭐')}
    </div>`;
});
