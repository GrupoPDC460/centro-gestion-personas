/* app.js — Arranque de la aplicación */
(async function () {
  const R = App.Repos, U = App.UI;

  // Primer arranque: catálogos base + demo si la base está vacía.
  async function seedIfEmpty() {
    // La demo se carga UNA sola vez (primer arranque). Si el usuario borra todo,
    // NO se vuelve a sembrar: la base queda vacía y lista para importar.
    const yaSembrado = await App.DB.get('config', 'seeded');
    if (yaSembrado) return;
    const emps = await R.employeeRepository.all();
    if (emps.length) { await App.DB.put('config', { key: 'seeded', value: true }); return; }
    const seed = App.DEMO_SEED;
    if (!seed) { await App.DB.put('config', { key: 'seeded', value: true }); return; }
    const depIds = []; for (const n of seed.departamentos) depIds.push(await R.departmentRepository.ensure(n));
    const pueIds = []; for (const n of seed.puestos) pueIds.push(await R.positionRepository.ensure(n));
    const tipIds = []; for (const n of seed.tipos) tipIds.push(await R.typeRepository.ensure(n));
    for (const c of seed.colaboradores) {
      const rec = {
        codigo: c.codigo, codigoJDE: c.codigoJDE, nombreCompleto: c.nombreCompleto,
        genero: c.genero, fechaNacimiento: c.fechaNacimiento, fechaIngreso: c.fechaIngreso,
        pais: c.pais, celular: c.celular, correoCorporativo: c.correoCorporativo,
        departamentoId: depIds[c.dep], puestoId: pueIds[c.pue], tipoColaboradorId: tipIds[c.tipo],
        tipoColaborador: seed.tipos[c.tipo], rol: c.rol, jefeCodigo: c.jefeCodigo || '',
        ubicacionActual: c.ubic || 'EN_SITIO', estado: c.estado || 'ACTIVO',
        fechaBaja: c.fechaBaja || '', motivoBaja: c.motivoBaja || '', tipoBaja: c.tipoBaja || '',
        emergencia: c.emg || {}, observaciones: '',
      };
      const id = await R.employeeRepository.create(rec);
      await R.movementRepository.add({ colaboradorId: id, tipo: 'ALTA', fecha: c.fechaIngreso, observaciones: 'Alta (demo)' });
      if (c.estado === 'INACTIVO') await R.movementRepository.add({ colaboradorId: id, tipo: 'BAJA', fecha: c.fechaBaja, observaciones: c.motivoBaja || 'Baja (demo)' });
      if (c.motivoBaja) await R.catalogRepository.ensure('motivoBaja', c.motivoBaja);
    }
    await App.DB.put('config', { key: 'seeded', value: true });
    U.toast('Datos de ejemplo cargados. Impórtalos reales en Configuración.', 'info');
  }

  // Búsqueda global
  async function globalSearch(q) {
    q = q.toLowerCase().trim();
    const box = document.getElementById('gsResults');
    if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
    const [emps, deptos, puestos] = await Promise.all([R.employeeRepository.all(), R.departmentRepository.all(), R.positionRepository.all()]);
    const hits = [];
    emps.forEach((e) => { if ([e.nombreCompleto, e.codigo, e.codigoJDE, e.correoCorporativo, e.celular].map((x) => String(x || '').toLowerCase()).join(' ').includes(q)) hits.push({ t: 'Colaborador', n: e.nombreCompleto, go: () => U.navigate('empleados', { id: e.id }) }); });
    deptos.forEach((d) => { if (d.nombre.toLowerCase().includes(q)) hits.push({ t: 'Departamento', n: d.nombre, go: () => U.navigate('empleados') }); });
    puestos.forEach((p) => { if (p.nombre.toLowerCase().includes(q)) hits.push({ t: 'Puesto', n: p.nombre, go: () => U.navigate('empleados') }); });
    box.innerHTML = hits.slice(0, 8).map((h, i) => `<div class="gs-item" data-i="${i}"><span class="chip">${h.t}</span>${U.esc(h.n)}</div>`).join('') || '<div class="gs-item muted">Sin resultados</div>';
    box.classList.add('open');
    box.querySelectorAll('.gs-item[data-i]').forEach((el) => el.onclick = () => { hits[+el.dataset.i].go(); box.classList.remove('open'); document.getElementById('gs').value = ''; });
  }

  function wireChrome() {
    document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('sidebar--open');
    document.getElementById('themeBtn').onclick = () => U.toggleTheme();
    const gs = document.getElementById('gs');
    let t; gs.oninput = () => { clearTimeout(t); t = setTimeout(() => globalSearch(gs.value), 150); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.gsearch')) document.getElementById('gsResults').classList.remove('open'); });
  }

  try {
    await App.DB.open();
    await U.initTheme();
    await seedIfEmpty();
    wireChrome();
    window.addEventListener('hashchange', U.render);
    await U.render();
  } catch (e) {
    console.error(e);
    document.getElementById('view').innerHTML = `<div class="empty"><h3>No se pudo iniciar</h3><p>${U.esc(e.message)}</p><p class="muted">Si abriste el archivo con doble clic, algunos navegadores limitan IndexedDB en file://. Publica en Vercel/GitHub Pages o usa un servidor local.</p></div>`;
  }
})();
