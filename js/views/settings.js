/* views/settings.js — Configuración: catálogos, importación, respaldo */
App.UI.route('configuracion', async function (main) {
  const R = App.Repos, U = App.UI;
  const [deptos, puestos, tipos, cats] = await Promise.all([
    R.departmentRepository.all(), R.positionRepository.all(), R.typeRepository.all(), R.catalogRepository.all(),
  ]);
  const motivos = cats.filter((c) => c.tipo === 'motivoBaja');

  const catCard = (titulo, items, tipo) => `<div class="card">
    <h3 class="card__title">${titulo} <span class="chip">${items.length}</span></h3>
    <div class="cat-list">${items.map((x) => `<div class="cat-item"><span>${U.esc(x.nombre || x.valor)}</span><button class="mini-x" data-tipo="${tipo}" data-id="${x.id}" title="Eliminar">✕</button></div>`).join('') || '<p class="muted">Vacío</p>'}</div>
    <div class="row-gap"><input class="input" id="new-${tipo}" placeholder="Agregar…"><button class="btn btn--ghost" data-add="${tipo}">Agregar</button></div></div>`;

  main.innerHTML = `<div class="page-head"><h1>Configuración</h1></div>

    <div class="card card--accent">
      <h3 class="card__title">Importar colaboradores (Excel / CSV)</h3>
      <p class="muted">Selecciona el archivo <b>demo-cobros venta directa.xlsx</b> u otro con el mismo formato. Los datos se guardan localmente en tu navegador (IndexedDB); no se envían a ningún servidor.</p>
      <div class="row-gap"><input type="file" id="impFile" accept=".xlsx,.xls,.csv" class="input"><button class="btn btn--primary" id="impBtn">Analizar archivo</button></div>
      <div id="impOut"></div>
    </div>

    <div class="cols cols--2" style="margin-top:16px">
      ${catCard('Departamentos', deptos, 'dep')}
      ${catCard('Puestos', puestos, 'pue')}
    </div>
    <div class="cols cols--2" style="margin-top:16px">
      ${catCard('Tipos de colaborador', tipos, 'tip')}
      ${catCard('Motivos de baja', motivos, 'mot')}
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="card__title">Respaldo y restauración</h3>
      <p class="muted">Genera un JSON con toda la base (incluye fotos) o restaura desde un respaldo previo.</p>
      <div class="row-gap">
        <button class="btn btn--ghost" id="bkBtn">Exportar respaldo</button>
        <input type="file" id="rsFile" accept="application/json" hidden>
        <button class="btn btn--ghost" id="rsBtn">Restaurar respaldo</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="card__title">Mi cuenta</h3>
      <p class="muted" id="acctWho">—</p>
      <div class="form-grid">
        <label class="f"><span>Nueva contraseña</span><input class="input" id="np1" type="password" placeholder="••••••••"></label>
        <label class="f"><span>Repetir contraseña</span><input class="input" id="np2" type="password" placeholder="••••••••"></label>
      </div>
      <div class="row-gap" style="margin-top:10px"><button class="btn btn--ghost" id="chgPass">Cambiar contraseña</button></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 class="card__title">Exportar información</h3>
      <p class="muted">Elige exactamente qué campos descargar (por ejemplo, solo nombre y extensión de Issabel, o nombre y líder).</p>
      <div class="row-gap" style="margin-top:10px"><button class="btn btn--primary" id="expBtn">Exportar colaboradores…</button></div>
    </div>

    <div class="card card--danger" style="margin-top:16px">
      <h3 class="card__title">Zona de peligro</h3>
      <p class="muted">Esto borra todos los colaboradores, movimientos, fotos y catálogos <b>de la base en la nube</b> (afecta a todos los usuarios). Úsalo con cuidado.</p>
      <div class="row-gap"><button class="btn btn--danger" id="wipeBtn">Borrar TODOS los datos</button></div>
    </div>`;

  // Mi cuenta
  (async () => {
    try { const u = await App.Auth.user(); if (u) document.getElementById('acctWho').textContent = 'Sesión: ' + (u.email || u.id); } catch (_) {}
  })();
  document.getElementById('chgPass').onclick = async () => {
    const a = document.getElementById('np1').value, b = document.getElementById('np2').value;
    if (a.length < 8) return U.toast('La contraseña debe tener al menos 8 caracteres', 'warn');
    if (a !== b) return U.toast('Las contraseñas no coinciden', 'warn');
    try { await App.Auth.changePassword(a); U.toast('Contraseña actualizada', 'ok'); document.getElementById('np1').value = ''; document.getElementById('np2').value = ''; }
    catch (e) { U.toast(e.message, 'err'); }
  };

  // Catálogos: agregar / eliminar
  main.querySelectorAll('[data-add]').forEach((b) => b.onclick = async () => {
    const tipo = b.dataset.add, val = (document.getElementById('new-' + tipo).value || '').trim();
    if (!val) return;
    if (tipo === 'dep') await R.departmentRepository.create(val);
    if (tipo === 'pue') await R.positionRepository.create(val);
    if (tipo === 'tip') await R.typeRepository.create(val);
    if (tipo === 'mot') await R.catalogRepository.create('motivoBaja', val);
    U.toast('Agregado'); App.UI.render();
  });
  main.querySelectorAll('.mini-x').forEach((b) => b.onclick = async () => {
    const { tipo, id } = b.dataset; const nid = +id;
    if (!(await U.confirm('¿Eliminar este elemento del catálogo?', { danger: true, ok: 'Eliminar' }))) return;
    if (tipo === 'dep') await R.departmentRepository.remove(nid);
    if (tipo === 'pue') await R.positionRepository.remove(nid);
    if (tipo === 'tip') await R.typeRepository.remove(nid);
    if (tipo === 'mot') await R.catalogRepository.remove(nid);
    U.toast('Eliminado'); App.UI.render();
  });

  // Importación
  let analisis = null;
  document.getElementById('impBtn').onclick = async () => {
    const f = document.getElementById('impFile').files[0];
    if (!f) return U.toast('Selecciona un archivo', 'warn');
    document.getElementById('impOut').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      analisis = await App.Import.analyze(f);
      document.getElementById('impOut').innerHTML = `<div class="banner banner--ok" style="margin-top:12px">
        Detectados <b>${analisis.total}</b> registros (${analisis.columnasDetectadas} columnas) · <b>${analisis.nuevos}</b> nuevos · <b>${analisis.duplicados}</b> ya existen.</div>
        <div class="row-gap">
          <button class="btn btn--primary" id="impGo">Importar ${analisis.nuevos} nuevos</button>
          ${analisis.duplicados ? '<button class="btn btn--ghost" id="impUpd">Importar y actualizar duplicados</button>' : ''}
        </div>`;
      document.getElementById('impGo').onclick = () => doImport('omitir');
      const up = document.getElementById('impUpd'); if (up) up.onclick = () => doImport('actualizar');
    } catch (err) { console.error(err); document.getElementById('impOut').innerHTML = `<div class="banner banner--err">Error al leer: ${U.esc(err.message)}</div>`; }
  };
  async function doImport(modo) {
    document.getElementById('impOut').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const res = await App.Import.commit(analisis.modelos, modo);
    U.toast(`Importación: ${res.creados} creados, ${res.actualizados} actualizados`, 'ok');
    App.UI.render();
  }

  // Backup / restore / wipe
  document.getElementById('bkBtn').onclick = () => U.backup();
  document.getElementById('expBtn').onclick = () => App.Exporter.abrir();
  document.getElementById('rsBtn').onclick = () => document.getElementById('rsFile').click();
  document.getElementById('rsFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await U.confirm('Esta acción reemplazará TODOS los datos actuales. ¿Deseas continuar?', { danger: true, ok: 'Restaurar' }))) return;
    try { await U.restore(f); App.UI.render(); } catch (err) { U.toast(err.message, 'err'); }
  };
  document.getElementById('wipeBtn').onclick = async () => {
    if (!(await U.confirm('Se borrarán TODOS los colaboradores, movimientos, fotos y catálogos <b>de la base en la nube</b>. Afecta a todos los usuarios y no se puede deshacer.', { danger: true, ok: 'Borrar todo' }))) return;
    await App.DB.clearAll(); U.toast('Datos borrados', 'ok'); App.UI.render();
  };
});
