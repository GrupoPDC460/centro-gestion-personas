/* ============================================================================
 * views/organization.js — Organigrama automático
 * Se acomoda solo: nivel superior arriba, líderes en fila y el equipo de cada
 * líder en columna vertical compacta. El usuario decide quién reporta a quién
 * (no dónde va cada caja). Sin lienzo, zoom ni arrastre que administrar.
 * ==========================================================================*/
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;

  const todos = await R.employeeRepository.all();
  const puestos = await R.positionRepository.all();
  const puestoNombre = (e) => (puestos.find((p) => p.id === e.puestoId) || {}).nombre || '';
  const porCodigo = new Map(todos.map((e) => [String(e.codigo), e]));

  // Preferencias de la vista (se recuerdan en la nube)
  const cfg = (await R.orgChartRepository.load()) || {};
  let verInactivos = cfg.verInactivos !== false;
  let modoAjuste = false;
  // Orden manual: { [codigoJefe|'__raiz']: [codigo, codigo, ...] }
  const orden = cfg.orden && typeof cfg.orden === 'object' ? cfg.orden : {};
  const guardarPref = () => R.orgChartRepository.save(Object.assign({}, cfg, { verInactivos, orden })).catch(() => {});

  // Aplica el orden manual guardado; los no listados van al final, alfabéticos.
  function aplicarOrden(clave, arr, comparadorBase) {
    const pref = orden[clave];
    if (!pref || !pref.length) return arr.sort(comparadorBase);
    const pos = new Map(pref.map((c, i) => [String(c), i]));
    return arr.sort((a, b) => {
      const ia = pos.has(String(a.codigo)) ? pos.get(String(a.codigo)) : Infinity;
      const ib = pos.has(String(b.codigo)) ? pos.get(String(b.codigo)) : Infinity;
      if (ia !== ib) return ia - ib;
      return comparadorBase(a, b);
    });
  }

  // Puesto abreviado: quita el "de Cobros Venta Directa…" que se repite en todos.
  function puestoCorto(e) {
    let p = puestoNombre(e) || '';
    p = p.replace(/\s*de\s+Cobros\s+Venta\s+Directa.*/i, '').trim();
    if (!p) p = puestoNombre(e).replace(/Cobros Venta Directa\s*/i, '').trim();
    return p || 'Gestor';
  }

  function construir() {
    const lista = todos.filter((e) => verInactivos || e.estado === 'ACTIVO');
    const hijos = new Map(); const raices = [];
    lista.forEach((e) => {
      const j = String(e.jefeCodigo || '');
      if (j && porCodigo.has(j) && j !== String(e.codigo) && lista.some((x) => String(x.codigo) === j)) {
        if (!hijos.has(j)) hijos.set(j, []);
        hijos.get(j).push(e);
      } else raices.push(e);
    });
    const alfabetico = (a, b) => String(a.nombreCompleto).localeCompare(String(b.nombreCompleto));
    hijos.forEach((arr, clave) => {
      aplicarOrden(clave, arr, (a, b) => {
        // Por defecto: primero quienes tienen gente a cargo, luego alfabético
        const ca = (hijos.get(String(a.codigo)) || []).length, cb = (hijos.get(String(b.codigo)) || []).length;
        if (!!ca !== !!cb) return cb - ca;
        return alfabetico(a, b);
      });
    });
    aplicarOrden('__raiz', raices, (a, b) => (hijos.get(String(b.codigo)) || []).length - (hijos.get(String(a.codigo)) || []).length);
    return { hijos, raices, lista };
  }

  // Tarjeta de una persona con mando (nivel superior / líderes)
  async function tarjetaLider(e, cuantos, nivel) {
    const inactivo = e.estado !== 'ACTIVO';
    return `<div class="ogx__card ogx__card--l${nivel} ${inactivo ? 'is-off' : ''}" data-id="${e.id}">
      ${await U.avatarHTML(e, nivel === 0 ? 54 : 46)}
      <div class="ogx__txt">
        <b>${U.esc(e.nombreCompleto)}</b>
        <span class="muted">${U.esc(puestoCorto(e))}</span>
      </div>
      ${cuantos ? `<span class="ogx__n" title="${cuantos} a cargo">${cuantos}</span>` : ''}
    </div>`;
  }

  // Fila compacta de un integrante del equipo (columna vertical)
  async function filaEquipo(e, jefeCod, idx, total) {
    const inactivo = e.estado !== 'ACTIVO';
    return `<div class="ogx__row ${inactivo ? 'is-off' : ''} ${modoAjuste ? 'is-adj' : ''}" data-id="${e.id}">
      ${await U.avatarHTML(e, 30)}
      <div class="ogx__rowtxt">
        <b>${U.esc(e.nombreCompleto)}</b>
        <span class="muted">${U.esc(puestoCorto(e))}</span>
      </div>
      ${inactivo ? '<span class="ogx__off">Inactivo</span>' : ''}
      ${modoAjuste ? `<span class="ogx__ord">
          <button class="ogx__arrow" data-up="${e.codigo}" data-j="${jefeCod}" ${idx === 0 ? 'disabled' : ''} title="Subir">▲</button>
          <button class="ogx__arrow" data-down="${e.codigo}" data-j="${jefeCod}" ${idx === total - 1 ? 'disabled' : ''} title="Bajar">▼</button>
        </span>` : `<button class="ogx__move" data-move="${e.id}" title="Cambiar de líder">⇄</button>`}
    </div>`;
  }

  // Columna: un líder con su equipo debajo
  async function columna(lider, hijos, jefeCod, idx, total) {
    const equipo = hijos.get(String(lider.codigo)) || [];
    const conMando = equipo.filter((x) => (hijos.get(String(x.codigo)) || []).length);
    const gestores = equipo.filter((x) => !(hijos.get(String(x.codigo)) || []).length);
    const sub = (await Promise.all(conMando.map((x, i) => columna(x, hijos, String(lider.codigo), i, conMando.length)))).join('');
    const flechas = modoAjuste ? `<div class="ogx__colord">
        <button class="ogx__arrow" data-left="${lider.codigo}" data-j="${jefeCod}" ${idx === 0 ? 'disabled' : ''} title="Mover a la izquierda">◀</button>
        <button class="ogx__arrow" data-right="${lider.codigo}" data-j="${jefeCod}" ${idx === total - 1 ? 'disabled' : ''} title="Mover a la derecha">▶</button>
      </div>` : '';
    return `<div class="ogx__branch">
      ${flechas}
      ${await tarjetaLider(lider, equipo.length, 1)}
      ${equipo.length ? '<span class="ogx__stem"></span>' : ''}
      ${gestores.length ? `<div class="ogx__team">${(await Promise.all(gestores.map((g, i) => filaEquipo(g, String(lider.codigo), i, gestores.length)))).join('')}</div>` : ''}
      ${sub ? `<div class="ogx__subs">${sub}</div>` : ''}
    </div>`;
  }

  async function pintar() {
    const { hijos, raices, lista } = construir();
    const activos = lista.filter((e) => e.estado === 'ACTIVO').length;

    let cuerpo = '';
    for (const raiz of raices) {
      const directos = hijos.get(String(raiz.codigo)) || [];
      const lideres = directos.filter((x) => (hijos.get(String(x.codigo)) || []).length);
      const sueltos = directos.filter((x) => !(hijos.get(String(x.codigo)) || []).length);
      cuerpo += `<div class="ogx__tree">
        <div class="ogx__top">${await tarjetaLider(raiz, directos.length, 0)}</div>
        ${directos.length ? '<span class="ogx__stem ogx__stem--top"></span>' : ''}
        ${sueltos.length ? `<div class="ogx__direct">${(await Promise.all(sueltos.map((s, i) => filaEquipo(s, String(raiz.codigo), i, sueltos.length)))).join('')}</div>` : ''}
        ${lideres.length ? `<div class="ogx__cols">${(await Promise.all(lideres.map((l, i) => columna(l, hijos, String(raiz.codigo), i, lideres.length)))).join('')}</div>` : ''}
      </div>`;
    }

    main.innerHTML = `
      <div class="page-head">
        <div><h1>Organización</h1><p class="muted">${modoAjuste ? 'Modo ajuste: usa las flechas para reordenar' : activos + ' activos · se acomoda automáticamente'}</p></div>
        <div class="row-gap">
          <label class="switch"><input type="checkbox" id="verInact" ${verInactivos ? 'checked' : ''}><span>Mostrar inactivos</span></label>
          <button class="btn ${modoAjuste ? 'btn--good' : 'btn--ghost'} btn--sm" id="adjBtn">${modoAjuste ? '✓ Listo' : '⇅ Ajustar orden'}</button>
          ${modoAjuste && Object.keys(orden).length ? '<button class="btn btn--ghost btn--sm" id="resetOrd">Restablecer</button>' : ''}
          <button class="btn btn--ghost btn--sm" id="expOrg">⤓ Exportar</button>
        </div>
      </div>
      <div class="ogx ${modoAjuste ? 'ogx--adj' : ''}">${cuerpo || '<div class="empty"><h3>Sin estructura definida</h3><p>Asigna el líder de cada colaborador desde su ficha.</p></div>'}</div>`;

    wire(hijos, lista);
  }

  function wire(hijos, lista) {
    main.querySelector('#verInact').onchange = (ev) => { verInactivos = ev.target.checked; guardarPref(); pintar(); };
    main.querySelector('#expOrg').onclick = () => exportar(hijos, lista);
    main.querySelector('#adjBtn').onclick = () => { modoAjuste = !modoAjuste; pintar(); };
    const rst = main.querySelector('#resetOrd');
    if (rst) rst.onclick = async () => {
      if (!(await U.confirm('Se descarta tu orden manual y vuelve al acomodo automático. ¿Continuar?', { ok: 'Restablecer' }))) return;
      Object.keys(orden).forEach((k) => delete orden[k]);
      guardarPref(); U.toast('Orden restablecido', 'ok'); pintar();
    };

    // Personas dentro de una columna: ▲ ▼ (se mueven respecto a sus pares)
    main.querySelectorAll('[data-up]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); moverEntrePares(b.dataset.j, b.dataset.up, -1); });
    main.querySelectorAll('[data-down]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); moverEntrePares(b.dataset.j, b.dataset.down, 1); });
    // Columnas de líderes: ◀ ▶
    main.querySelectorAll('[data-left]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); moverEntrePares(b.dataset.j, b.dataset.left, -1); });
    main.querySelectorAll('[data-right]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); moverEntrePares(b.dataset.j, b.dataset.right, 1); });

    // Abrir ficha (solo fuera del modo ajuste, para no estorbar)
    main.querySelectorAll('[data-id]').forEach((el) => el.onclick = (ev) => {
      if (ev.target.closest('button')) return;
      App.UI.navigate('empleados', { id: +el.dataset.id });
    });

    main.querySelectorAll('[data-move]').forEach((b) => b.onclick = async (ev) => {
      ev.stopPropagation();
      const e = lista.find((x) => x.id === +b.dataset.move); if (!e) return;
      await cambiarLider(e, lista);
    });
  }

  // Mueve un elemento dentro de su grupo. Solo se intercambia con vecinos del
  // mismo tipo (líder con líder, gestor con gestor), que es como se muestran.
  function moverEntrePares(clave, codigo, delta) {
    const { hijos, raices } = construir();
    const grupo = clave === '__raiz' ? raices : (hijos.get(String(clave)) || []);
    if (!grupo.length) return;
    const tieneMando = (x) => (hijos.get(String(x.codigo)) || []).length > 0;
    const yo = grupo.find((x) => String(x.codigo) === String(codigo));
    if (!yo) return;

    // Posiciones (dentro del grupo) de los elementos del mismo tipo
    const idxPares = [];
    grupo.forEach((x, i) => { if (tieneMando(x) === tieneMando(yo)) idxPares.push(i); });
    const p = idxPares.indexOf(grupo.indexOf(yo));
    const q = p + delta;
    if (p < 0 || q < 0 || q >= idxPares.length) return;

    // Intercambiar en el arreglo del grupo y guardar el orden resultante
    const copia = grupo.slice();
    const a = idxPares[p], b = idxPares[q];
    const tmp = copia[a]; copia[a] = copia[b]; copia[b] = tmp;
    orden[clave] = copia.map((x) => String(x.codigo));
    guardarPref();
    pintar();
  }

  async function cambiarLider(e, lista) {
    const candidatos = lista.filter((x) => x.id !== e.id);
    const html = `<p class="muted" style="margin:0 0 12px"><b>${U.esc(e.nombreCompleto)}</b> pasará a reportar a:</p>
      <label class="f"><span>Líder</span>
        <select class="input" id="mvJefe">
          <option value="">— Nivel superior (sin jefe) —</option>
          ${candidatos.map((c) => `<option value="${c.codigo}" ${String(e.jefeCodigo) === String(c.codigo) ? 'selected' : ''}>${U.esc(c.nombreCompleto)}</option>`).join('')}
        </select></label>`;
    const mo = U.modal(html, {
      title: 'Cambiar de líder',
      buttons: [{ label: 'Cancelar' }, { label: 'Guardar', variant: 'primary', onClick: (back) => { aplicar(back); return true; } }],
    });
    async function aplicar(back) {
      const cod = mo.el.querySelector('#mvJefe').value;
      if (cod && crearíaCiclo(e, cod, lista)) { U.toast('Esa asignación crearía un ciclo', 'warn'); return; }
      const jefe = candidatos.find((c) => String(c.codigo) === cod);
      await R.employeeRepository.update(e.id, {
        jefeCodigo: cod || '', jefeNombre: jefe ? jefe.nombreCompleto : '',
        supervisorNombre: jefe ? jefe.nombreCompleto : '',
      });
      await R.auditRepository.add('CAMBIO_JEFE', e.id, 'jefe', e.jefeNombre || '', jefe ? jefe.nombreCompleto : '(nivel superior)');
      U.toast('Líder actualizado', 'ok');
      if (back) { back.classList.add('modal-back--out'); setTimeout(() => back.remove(), 200); }
      // Releer para reflejar el cambio
      const fresco = await R.employeeRepository.get(e.id);
      Object.assign(e, fresco);
      const idx = todos.findIndex((t) => t.id === e.id); if (idx >= 0) todos[idx] = fresco;
      pintar();
    }
  }

  function crearíaCiclo(e, codJefe, lista) {
    let cur = codJefe, guard = 0;
    while (cur && guard++ < 60) {
      if (String(cur) === String(e.codigo)) return true;
      const p = lista.find((x) => String(x.codigo) === String(cur));
      cur = p ? p.jefeCodigo : null;
    }
    return false;
  }

  // Exportar la estructura como CSV (jerarquía plana)
  function exportar(hijos, lista) {
    const filas = [];
    const recorrer = (e, nivel, ruta) => {
      filas.push({
        Nivel: nivel,
        Colaborador: e.nombreCompleto,
        Codigo: e.codigo,
        Puesto: puestoNombre(e),
        Lider: e.jefeNombre || '',
        Estado: e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo',
        Ruta: ruta,
      });
      (hijos.get(String(e.codigo)) || []).forEach((k) => recorrer(k, nivel + 1, ruta ? ruta + ' > ' + e.nombreCompleto : e.nombreCompleto));
    };
    lista.filter((e) => { const j = String(e.jefeCodigo || ''); return !j || !lista.some((x) => String(x.codigo) === j); })
      .forEach((r) => recorrer(r, 0, ''));
    const cab = ['Nivel', 'Colaborador', 'Codigo', 'Puesto', 'Lider', 'Estado', 'Ruta'];
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [cab.join(','), ...filas.map((f) => cab.map((c) => esc(f[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `organigrama_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    U.toast('Organigrama exportado', 'ok');
  }

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
