/* views/employees.js — Módulo de colaboradores (CRUD real + foto + baja) */
(function () {
  const R = () => App.Repos, C = () => App.Calc, U = () => App.UI;

  App.UI.route('empleados', async function (main, params) {
    const [emps, deptos, puestos, tipos] = await Promise.all([
      R().employeeRepository.all(), R().departmentRepository.all(),
      R().positionRepository.all(), R().typeRepository.all(),
    ]);
    const depName = Object.fromEntries(deptos.map((d) => [d.id, d.nombre]));
    const posName = Object.fromEntries(puestos.map((d) => [d.id, d.nombre]));

    main.innerHTML = `
      <div class="page-head"><div><h1>Colaboradores</h1><p class="muted"><span id="cont">${emps.length}</span> registros</p></div>
        <button class="btn btn--primary" id="nuevoBtn">+ Nuevo colaborador</button></div>
      <div class="filters">
        <div class="filters__row">
          <input id="buscar" class="input input--search" placeholder="Buscar por nombre, código, JDE, correo o teléfono…" autocomplete="off">
          <div class="viewtoggle" role="group" aria-label="Vista">
            <button class="viewtoggle__b" data-view="cards" title="Tarjetas"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></button>
            <button class="viewtoggle__b" data-view="table" title="Tabla"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          </div>
        </div>
        <div class="filters__row">
          <div class="segmented" id="segEstado">
            <button class="segmented__b" data-est="">Todos</button>
            <button class="segmented__b" data-est="ACTIVO">Activos</button>
            <button class="segmented__b" data-est="INACTIVO">Inactivos</button>
          </div>
          <select id="fDep" class="input input--pill"><option value="">Departamento: todos</option>${deptos.map((d) => `<option value="${d.id}">${U().esc(d.nombre)}</option>`).join('')}</select>
          <select id="fPue" class="input input--pill"><option value="">Puesto: todos</option>${puestos.map((d) => `<option value="${d.id}">${U().esc(d.nombre)}</option>`).join('')}</select>
          <select id="fGen" class="input input--pill"><option value="">Género: todos</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option></select>
          <select id="fAnt" class="input input--pill"><option value="">Antigüedad: toda</option>${Object.entries(C().CAT_ANTIGUEDAD).filter(([k]) => k !== 'sin_dato').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button class="btn btn--ghost btn--sm" id="limpiar" title="Quitar filtros">Limpiar</button>
        </div>
      </div>
      <div id="tabla" class="table-wrap"></div>`;

    const st = { q: '', dep: '', pue: '', est: '', gen: '', ant: '', view: 'cards' };
    const UBIC = [['EN_SITIO', 'En sitio'], ['REMOTO', 'Remoto'], ['VACACIONES', 'Vacaciones'], ['PERMISO', 'Permiso'], ['INCAPACIDAD', 'Incapacidad'], ['AUSENTE', 'Ausente']];
    async function pintar() {
      const q = st.q.toLowerCase();
      let list = emps.filter((e) => {
        if (st.dep && String(e.departamentoId) !== st.dep) return false;
        if (st.pue && String(e.puestoId) !== st.pue) return false;
        if (st.est && e.estado !== st.est) return false;
        if (st.gen && !new RegExp('^' + st.gen[0], 'i').test(e.genero)) return false;
        if (st.ant && C().antiguedad(e.fechaIngreso).categoria !== st.ant) return false;
        if (q) {
          const hay = [e.nombreCompleto, e.codigo, e.codigoJDE, e.correoCorporativo, e.correoPersonal, e.celular].map((x) => String(x || '').toLowerCase()).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const tabla = document.getElementById('tabla');
      const cont = document.getElementById('cont');
      if (!tabla) return; // se navegó a otra vista mientras filtraba
      if (cont) cont.textContent = list.length;
      if (!list.length) { tabla.innerHTML = '<div class="empty"><h3>Sin resultados</h3><p>Ajusta los filtros o la búsqueda.</p></div>'; return; }
      const selEstado = (e) => `<select class="mini-select estado-sel" data-id="${e.id}" title="Estado">
              <option value="ACTIVO" ${e.estado === 'ACTIVO' ? 'selected' : ''}>🟢 Activo</option>
              <option value="INACTIVO" ${e.estado !== 'ACTIVO' ? 'selected' : ''}>⚪ Inactivo</option>
            </select>`;
      const selUbic = (e) => `<select class="mini-select ubic-sel" data-id="${e.id}" title="Ubicación / situación">
              ${UBIC.map(([v, l]) => `<option value="${v}" ${(e.ubicacionActual || 'EN_SITIO') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>`;
      const acciones = (e) => `<button class="mini-act" data-act="editar" data-id="${e.id}" title="Editar">✎</button>
            <button class="mini-act mini-act--danger" data-act="eliminar" data-id="${e.id}" title="Eliminar perfil">🗑</button>`;

      if (st.view === 'cards') {
        const cards = await Promise.all(list.map(async (e) => {
          const ant = C().antiguedad(e.fechaIngreso);
          const activo = e.estado === 'ACTIVO';
          return `<article class="pcard rowlink ${activo ? '' : 'pcard--off'}" data-id="${e.id}">
            <header class="pcard__top">
              ${await U().avatarHTML(e, 52)}
              <div class="pcard__id">
                <b>${U().esc(e.nombreCompleto)}</b>
                <span class="muted">${U().esc(posName[e.puestoId] || 'Sin puesto')}</span>
              </div>
              <span class="dot ${activo ? 'dot--ok' : 'dot--off'}" title="${activo ? 'Activo' : 'Inactivo'}"></span>
            </header>
            <div class="pcard__meta">
              <span class="chip">${U().esc(e.codigo)}</span>
              ${e.extensionIssabel ? `<span class="chip">Ext. ${U().esc(e.extensionIssabel)}</span>` : ''}
              <span class="chip">${ant.years > 0 ? ant.years + ' año' + (ant.years === 1 ? '' : 's') : 'Nuevo'}</span>
            </div>
            ${e.correoCorporativo || e.celular ? `<div class="pcard__contact muted">${U().esc(e.correoCorporativo || e.celular)}</div>` : ''}
            <footer class="pcard__foot">
              <div class="pcard__sels">${selEstado(e)}${selUbic(e)}</div>
              <div class="acciones">${acciones(e)}</div>
            </footer>
          </article>`;
        }));
        tabla.innerHTML = `<div class="pgrid">${cards.join('')}</div>`;
      } else {
        const rows = await Promise.all(list.map(async (e) => {
          const ant = C().antiguedad(e.fechaIngreso);
          return `<tr data-id="${e.id}" class="rowlink">
            <td class="cell-person">${await U().avatarHTML(e, 36)}<div><b>${U().esc(e.nombreCompleto)}</b><span class="muted">${U().esc(e.correoCorporativo || e.correoPersonal || '')}</span></div></td>
            <td>${U().esc(e.codigo)}<span class="muted"> · JDE ${U().esc(e.codigoJDE || '—')}</span></td>
            <td>${U().esc(depName[e.departamentoId] || '—')}</td>
            <td>${U().esc(posName[e.puestoId] || '—')}</td>
            <td>${ant.text}</td>
            <td class="estado-cell">${selEstado(e)}${selUbic(e)}</td>
            <td class="acciones">${acciones(e)}</td>
          </tr>`;
        }));
        tabla.innerHTML = `<table class="table"><thead><tr>
          <th>Colaborador</th><th>Código</th><th>Departamento</th><th>Puesto</th><th>Antigüedad</th><th>Estado / Ubicación</th><th>Acciones</th></tr></thead>
          <tbody>${rows.join('')}</tbody></table>`;
      }
      const byId = (id) => emps.find((x) => x.id === id);
      tabla.querySelectorAll('.rowlink').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('[data-act]') || ev.target.closest('select')) return; ficha(+tr.dataset.id); });
      tabla.querySelectorAll('[data-act]').forEach((b) => b.onclick = async (ev) => {
        ev.stopPropagation();
        const e = byId(+b.dataset.id); if (!e) return;
        if (b.dataset.act === 'editar') return form(e);
        if (b.dataset.act === 'eliminar') return eliminar(e);
      });
      tabla.querySelectorAll('.estado-sel').forEach((s) => {
        s.onclick = (ev) => ev.stopPropagation();
        s.onchange = async (ev) => { ev.stopPropagation(); await cambiarEstado(byId(+s.dataset.id), s.value); };
      });
      tabla.querySelectorAll('.ubic-sel').forEach((s) => {
        s.onclick = (ev) => ev.stopPropagation();
        s.onchange = async (ev) => {
          ev.stopPropagation();
          const e = byId(+s.dataset.id); if (!e) return;
          await R().employeeRepository.update(e.id, { ubicacionActual: s.value });
          e.ubicacionActual = s.value;
          U().toast('Ubicación actualizada', 'ok');
        };
      });
    }

    // Cambio de estado fácil (Activo/Inactivo) con historial y auditoría.
    async function cambiarEstado(e, nuevo) {
      if (!e || e.estado === nuevo) return;
      const hoy = new Date().toISOString().slice(0, 10);
      if (nuevo === 'INACTIVO') {
        await R().employeeRepository.update(e.id, { estado: 'INACTIVO', fechaBaja: hoy });
        await R().movementRepository.add({ colaboradorId: e.id, tipo: 'BAJA', fecha: hoy, observaciones: 'Baja (cambio rápido)' });
        await R().auditRepository.add('BAJA', e.id, 'estado', 'ACTIVO', 'INACTIVO');
      } else {
        await R().employeeRepository.update(e.id, { estado: 'ACTIVO', fechaBaja: '', motivoBaja: '', tipoBaja: '' });
        await R().movementRepository.add({ colaboradorId: e.id, tipo: 'REINGRESO', fecha: hoy, observaciones: 'Reactivación (cambio rápido)' });
        await R().auditRepository.add('REINGRESO', e.id, 'estado', 'INACTIVO', 'ACTIVO');
      }
      U().toast('Estado actualizado', 'ok');
      App.UI.render();
    }

    // Eliminación permanente (a solicitud): borra perfil + historial + foto + auditoría.
    async function eliminar(e) {
      const movs = await R().movementRepository.byColaborador(e.id);
      const aviso = `Vas a ELIMINAR de forma permanente a <b>${U().esc(e.nombreCompleto)}</b>`
        + (movs.length ? ` y sus <b>${movs.length}</b> movimiento(s) de historial` : '')
        + `, además de su fotografía. Esta acción no se puede deshacer.<br><br>Si solo quieres desactivarlo, usa <b>Inactivo</b> en su lugar (conserva el historial).`;
      const ok = await U().confirm(aviso, { title: 'Eliminar perfil', danger: true, ok: 'Eliminar definitivamente' });
      if (!ok) return;
      for (const m of movs) await R().movementRepository.remove(m.id);
      await R().photoRepository.remove(e.id);
      await R().auditRepository.add('ELIMINACION', e.id, 'perfil', e.nombreCompleto, 'eliminado');
      await R().employeeRepository.remove(e.id);
      U().toast('Perfil eliminado', 'ok');
      App.UI.render();
    }

    document.getElementById('buscar').oninput = (e) => { st.q = e.target.value; pintar(); };
    document.getElementById('fDep').onchange = (e) => { st.dep = e.target.value; pintar(); };
    document.getElementById('fPue').onchange = (e) => { st.pue = e.target.value; pintar(); };
    document.getElementById('fGen').onchange = (e) => { st.gen = e.target.value; pintar(); };
    document.getElementById('fAnt').onchange = (e) => { st.ant = e.target.value; pintar(); };
    document.getElementById('nuevoBtn').onclick = () => form(null);

    // Segmento de estado
    const segs = document.querySelectorAll('#segEstado .segmented__b');
    const marcarSeg = () => segs.forEach((b) => b.classList.toggle('is-on', b.dataset.est === st.est));
    segs.forEach((b) => b.onclick = () => { st.est = b.dataset.est; marcarSeg(); pintar(); });
    marcarSeg();

    // Cambio de vista (tarjetas / tabla), recordado entre sesiones
    const vbs = document.querySelectorAll('.viewtoggle__b');
    const marcarVista = () => vbs.forEach((b) => b.classList.toggle('is-on', b.dataset.view === st.view));
    vbs.forEach((b) => b.onclick = async () => {
      st.view = b.dataset.view; marcarVista(); pintar();
      try { await R().settingsRepository.set('vistaColaboradores', st.view); } catch (_) {}
    });
    R().settingsRepository.get('vistaColaboradores').then((v) => {
      if (v && v !== st.view) { st.view = v; marcarVista(); pintar(); } else marcarVista();
    }).catch(() => marcarVista());

    // Limpiar filtros
    document.getElementById('limpiar').onclick = () => {
      st.q = ''; st.dep = ''; st.pue = ''; st.est = ''; st.gen = ''; st.ant = '';
      document.getElementById('buscar').value = '';
      ['fDep', 'fPue', 'fGen', 'fAnt'].forEach((id) => { document.getElementById(id).value = ''; });
      marcarSeg(); pintar();
    };
    await pintar();
    if (params && params.id) ficha(+params.id);

    // ---------------- Ficha / perfil ----------------
    async function ficha(id) {
      const e = await R().employeeRepository.get(id);
      if (!e) return;
      const ant = C().antiguedad(e.fechaIngreso), edad = C().edad(e.fechaNacimiento);
      const movs = (await R().movementRepository.byColaborador(id)).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      const av = await U().avatarHTML(e, 92);
      // Los campos sin información se omiten para reducir carga visual.
      const vacio = (v) => v == null || String(v).trim() === '' || String(v).trim() === '—';
      const line = (l, v) => (vacio(v) ? '' : `<div class="fld"><span class="fld__l">${l}</span><span class="fld__v">${U().esc(v)}</span></div>`);
      const html = `
        <div class="ficha">
          <div class="ficha__head">
            <div class="ficha__ph" id="phBox">${av}
              <button class="ph-edit" id="phBtn" title="Cambiar fotografía">📷</button>
              <input type="file" id="phInput" accept="image/png,image/jpeg,image/jpg,image/webp" hidden></div>
            <div><h2>${U().esc(e.nombreCompleto)}</h2>
              <p class="muted">${U().esc(posName(e))} · ${U().esc(depName(e))}</p>
              <div class="chips"><span class="badge badge--${e.estado === 'ACTIVO' ? 'ok' : 'off'}">${e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</span>
                <span class="chip">${U().esc(e.tipoColaborador || '')}</span><span class="chip">${U().esc(e.pais || '')}</span></div>
            </div>
          </div>
          <div class="ficha__acts">
            ${e.celular ? `<a class="btn btn--ghost" href="tel:${U().esc(e.celular)}">📞 Llamar</a>` : ''}
            ${e.correoCorporativo || e.correoPersonal ? `<a class="btn btn--ghost" href="mailto:${U().esc(e.correoCorporativo || e.correoPersonal)}">✉ Correo</a>` : ''}
            <button class="btn btn--ghost" id="copyTel">Copiar teléfono</button>
            <button class="btn btn--primary" id="editBtn">Editar</button>
            ${e.estado === 'ACTIVO' ? '<button class="btn btn--danger" id="bajaBtn">Registrar baja</button>' : '<button class="btn btn--good" id="reingBtn">Reingreso</button>'}
            <button class="btn btn--ghost" id="delBtn" title="Eliminar perfil">🗑 Eliminar</button>
          </div>
          <div class="cols cols--2">
            <div class="card"><h3 class="card__title">Información personal</h3>
              ${line('Código', e.codigo)}${line('Código JDE', e.codigoJDE)}
              ${line('Nacimiento', U().fechaCorta(e.fechaNacimiento) + (edad != null ? ` (${edad} años)` : ''))}
              ${line('Género', e.genero)}${line('Estado civil', e.estadoCivil)}
              ${line('Celular', e.celular)}${line('Tel. compañía', e.telefonoCompania)}${line('Tel. corporativo', e.telefonoCorporativo)}${line('Tel. casa', e.telefonoCasa)}
              ${line('Agente (Issabel)', e.agente)}${line('Extensión Issabel', e.extensionIssabel)}${line('Supervisor', e.supervisorNombre)}
              ${line('Correo personal', e.correoPersonal)}${line('Correo corporativo', e.correoCorporativo)}
              ${line('País', e.pais)}${line('Depto./Estado', e.divGeo1)}${line('Municipio', e.divGeo2)}
              ${line('Dirección', e.direccion)}${line('Escolaridad', e.escolaridad)}
              ${line('Carrera', e.carrera)}${line('Postgrados', e.postgrados)}${line('Enf. crónicas', e.enfermedadesCronicas)}</div>
            <div class="card"><h3 class="card__title">Información laboral</h3>
              ${line('Departamento', depName(e))}${line('Puesto', posName(e))}${line('Especialidad', e.especialidad)}${line('Título', e.titulo)}
              ${line('Rol', e.rol)}${line('Grado', e.grado)}${line('Equipo a cargo', e.equipoACargo)}
              ${line('Tipo', e.tipoColaborador)}${line('Tipo de contrato', e.tipoContrato)}
              ${line('Ingreso', U().fechaCorta(e.fechaIngreso))}${line('Antigüedad', ant.text)}
              ${line('Jefe inmediato', e.jefeNombre)}${line('Último líder', e.ultimoLiderNombre)}${line('Reclutador', e.reclutador)}
              ${line('Sitio', e.sitio)}${line('Sociedad', e.sociedad)}${line('Empresa', e.empresa)}
              ${e.areaTrail && e.areaTrail.length ? line('Área (jerarquía)', e.areaTrail.join(' › ')) : ''}
              ${line('Estado actual', ubicLabel(e.ubicacionActual))}
              ${e.estado === 'INACTIVO' ? line('Fecha de baja', U().fechaCorta(e.fechaBaja)) + line('Motivo', e.motivoBaja) : ''}</div>
          </div>
          <div class="cols cols--2">
            ${cardFamilia(e)}
            ${cardDocs(e)}
          </div>
          <div class="cols cols--2">
            <div class="card"><h3 class="card__title">Contacto de emergencia</h3>
              ${line('Contacto', e.emergencia && e.emergencia.nombre)}${line('Parentesco', e.emergencia && e.emergencia.parentesco)}${line('Teléfono', e.emergencia && e.emergencia.telefono)}</div>
            <div class="card"><h3 class="card__title">Historial de movimientos</h3>
              ${movs.length ? movs.map((m) => `<div class="mv"><span class="mv__tag mv__tag--${m.tipo}">${U().esc(m.tipo.replace('_', ' '))}</span><span>${U().fechaCorta(m.fecha)}</span><span class="muted">${U().esc(m.observaciones || '')}</span></div>`).join('') : '<p class="muted">Sin movimientos.</p>'}</div>
          </div>
          <div id="ausWrap">${await App.Absences.cardHTML(e)}</div>
          ${cardExtras(e)}
        </div>`;

      function cardFamilia(x) {
        const hijos = (x.hijos || []).filter((h) => h && h.nombre);
        const has = x.nombrePadre || x.nombreMadre || x.nombreConyuge || x.cantidadHijos || hijos.length;
        if (!has) return '';
        const hijosHtml = hijos.length
          ? `<div class="fld"><span class="fld__l">Hijos</span><span class="fld__v">${hijos.map((h) => U().esc(h.nombre) + (h.genero ? ` (${U().esc(h.genero)})` : '')).join('<br>')}</span></div>`
          : '';
        return `<div class="card"><h3 class="card__title">Familia</h3>
          ${line('Cónyuge', x.nombreConyuge)}${line('Padre', x.nombrePadre)}${line('Madre', x.nombreMadre)}
          ${x.cantidadHijos ? line('Cantidad de hijos', x.cantidadHijos) : ''}${hijosHtml}</div>`;
      }
      function cardDocs(x) {
        const has = x.documentoId || x.nit || x.seguroSocial || x.docVencimiento || x.automovil || x.motocicleta;
        if (!has) return '';
        const auto = x.automovil ? `${x.automovil}${x.licenciaAutoTipo ? ' · ' + x.licenciaAutoTipo : ''}${x.licenciaAutoVence ? ' · vence ' + U().fechaCorta(x.licenciaAutoVence) : ''}` : '';
        const moto = x.motocicleta ? `${x.motocicleta}${x.licenciaMotoVence ? ' · vence ' + U().fechaCorta(x.licenciaMotoVence) : ''}` : '';
        return `<div class="card"><h3 class="card__title">Documentos y vehículos</h3>
          ${line('Documento (DPI)', x.documentoId)}
          ${x.docEmision ? line('Emisión doc.', U().fechaCorta(x.docEmision)) : ''}${x.docVencimiento ? line('Vence doc.', U().fechaCorta(x.docVencimiento)) : ''}
          ${line('NIT', x.nit)}${line('Seguro social', x.seguroSocial)}
          ${auto ? line('Automóvil', auto) : ''}${moto ? line('Motocicleta', moto) : ''}</div>`;
      }
      function cardExtras(x) {
        const ex = (x.extras || []).filter((r) => r && r.k && r.v);
        if (!ex.length) return '';
        return `<div class="card" style="margin-top:16px">
          <details><summary style="cursor:pointer;font-weight:800;font-size:.95rem">Datos adicionales importados (${ex.length})</summary>
            <div style="margin-top:12px">${ex.map((r) => `<div class="fld"><span class="fld__l">${U().esc(r.k)}</span><span class="fld__v">${U().esc(r.v)}</span></div>`).join('')}</div>
          </details></div>`;
      }
      const mo = U().modal(html, { title: 'Ficha del colaborador', wide: true });
      // Ausencias: recargar la tarjeta tras cambios sin cerrar la ficha.
      const refrescarAus = async () => {
        const w = mo.el.querySelector('#ausWrap');
        if (!w) return;
        w.innerHTML = await App.Absences.cardHTML(e);
        App.Absences.wire(w, e, refrescarAus);
      };
      App.Absences.wire(mo.el, e, refrescarAus);

      function depName(x) { return (deptos.find((d) => d.id === x.departamentoId) || {}).nombre || '—'; }
      function posName(x) { return (puestos.find((d) => d.id === x.puestoId) || {}).nombre || '—'; }

      mo.el.querySelector('#editBtn').onclick = () => { mo.close(); form(e); };
      mo.el.querySelector('#copyTel').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(e.celular || ''); U().toast('Teléfono copiado'); };
      const bb = mo.el.querySelector('#bajaBtn'); if (bb) bb.onclick = () => { mo.close(); bajaForm(e); };
      const rb = mo.el.querySelector('#reingBtn'); if (rb) rb.onclick = () => { mo.close(); reingreso(e); };
      const db = mo.el.querySelector('#delBtn'); if (db) db.onclick = () => { mo.close(); eliminar(e); };
      // Foto
      const phBtn = mo.el.querySelector('#phBtn'), phInput = mo.el.querySelector('#phInput');
      phBtn.onclick = () => phInput.click();
      phInput.onchange = async () => {
        const f = phInput.files[0]; if (!f) return;
        phInput.value = '';
        if (!/image\/(png|jpe?g|webp)/.test(f.type)) return U().toast('Formato no permitido', 'warn');
        const dataUrl = await App.PhotoEditor.abrir(f, U());
        if (!dataUrl) return; // cancelado
        await R().photoRepository.set(e.id, dataUrl);
        await R().auditRepository.add('CAMBIO_FOTO', e.id, 'foto', '', 'actualizada');
        U().toast('Fotografía actualizada'); mo.close(); ficha(id);
      };
    }

    // ---------------- Formulario alta/edición ----------------
    async function form(e) {
      const isNew = !e; e = e || { emergencia: {} };
      const opt = (list, sel, extra) => (extra ? `<option value="">— seleccionar —</option>` : '') + list.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${U().esc(x.nombre)}</option>`).join('');
      const f = (id, label, val, type, req) => `<label class="f"><span>${label}${req ? ' *' : ''}</span><input class="input" id="${id}" type="${type || 'text'}" value="${U().esc(val || '')}"></label>`;
      const html = `
        <h4 class="form-sec">Identificación</h4>
        <div class="form-grid">
          ${f('f_codigo', 'Código', e.codigo, 'text', true)}
          ${f('f_jde', 'Código JDE', e.codigoJDE)}
          ${f('f_nom', 'Nombre completo', e.nombreCompleto, 'text', true)}
          ${f('f_doc', 'Documento (DPI)', e.documentoId)}
          ${f('f_docE', 'Emisión documento', e.docEmision, 'date')}
          ${f('f_docV', 'Vencimiento documento', e.docVencimiento, 'date')}
          ${f('f_nit', 'NIT', e.nit)}
          ${f('f_ss', 'Seguro social', e.seguroSocial)}
        </div>

        <h4 class="form-sec">Datos personales</h4>
        <div class="form-grid">
          ${f('f_nac', 'Fecha de nacimiento', e.fechaNacimiento, 'date')}
          <label class="f"><span>Género</span><select class="input" id="f_gen"><option value="">—</option><option ${/^m/i.test(e.genero) ? 'selected' : ''}>Masculino</option><option ${/^f/i.test(e.genero) ? 'selected' : ''}>Femenino</option></select></label>
          ${f('f_ecivil', 'Estado civil', e.estadoCivil)}
          ${f('f_esc', 'Escolaridad', e.escolaridad)}
          ${f('f_carr', 'Carrera', e.carrera)}
          ${f('f_post', 'Postgrados', e.postgrados)}
          ${f('f_esptec', 'Especialización técnica', e.especializacionTecnica)}
          ${f('f_enf', 'Enfermedades crónicas', e.enfermedadesCronicas)}
        </div>

        <h4 class="form-sec">Contacto</h4>
        <div class="form-grid">
          ${f('f_cel', 'Celular', e.celular)}
          ${f('f_telc', 'Teléfono compañía', e.telefonoCompania)}
          ${f('f_telcorp', 'Teléfono corporativo', e.telefonoCorporativo)}
          ${f('f_telcasa', 'Teléfono casa', e.telefonoCasa)}
          ${f('f_cor', 'Correo corporativo', e.correoCorporativo, 'email')}
          ${f('f_corp', 'Correo personal', e.correoPersonal, 'email')}
          ${f('f_pais', 'País', e.pais)}
          ${f('f_geo1', 'Departamento/Estado', e.divGeo1)}
          ${f('f_geo2', 'Municipio/Provincia', e.divGeo2)}
          <label class="f f--full"><span>Dirección</span><input class="input" id="f_dir" value="${U().esc(e.direccion || '')}"></label>
        </div>

        <h4 class="form-sec">Información laboral</h4>
        <div class="form-grid">
          <label class="f"><span>Departamento</span><select class="input" id="f_dep">${opt(deptos, e.departamentoId, true)}</select></label>
          <label class="f"><span>Puesto</span><select class="input" id="f_pue">${opt(puestos, e.puestoId, true)}</select></label>
          <label class="f"><span>Tipo</span><select class="input" id="f_tip">${opt(tipos, e.tipoColaboradorId, true)}</select></label>
          ${f('f_ing', 'Fecha de ingreso', e.fechaIngreso, 'date', true)}
          ${f('f_jefe', 'Jefe inmediato', e.jefeNombre)}
          ${f('f_sup', 'Supervisor', e.supervisorNombre)}
          ${f('f_rol', 'Rol', e.rol)}
          ${f('f_grado', 'Grado', e.grado)}
          ${f('f_esp', 'Especialidad', e.especialidad)}
          ${f('f_tit', 'Título', e.titulo)}
          ${f('f_sitio', 'Sitio', e.sitio)}
          ${f('f_soc', 'Sociedad', e.sociedad)}
          ${f('f_emp', 'Empresa', e.empresa)}
          ${f('f_cc', 'Centro de costo', e.centroCosto)}
          ${f('f_contr', 'Tipo de contrato', e.tipoContrato)}
          ${f('f_recl', 'Reclutador', e.reclutador)}
          ${f('f_agente', 'Agente (Issabel)', e.agente)}
          ${f('f_ext', 'Extensión Issabel', e.extensionIssabel)}
          <label class="f"><span>Estado actual</span><select class="input" id="f_ubic">${['EN_SITIO', 'REMOTO', 'VACACIONES', 'PERMISO', 'INCAPACIDAD', 'AUSENTE'].map((u) => `<option value="${u}" ${e.ubicacionActual === u ? 'selected' : ''}>${ubicLabel(u)}</option>`).join('')}</select></label>
        </div>

        <h4 class="form-sec">Familia</h4>
        <div class="form-grid">
          ${f('f_conyuge', 'Cónyuge', e.nombreConyuge)}
          ${f('f_padre', 'Padre', e.nombrePadre)}
          ${f('f_madre', 'Madre', e.nombreMadre)}
          ${f('f_hijos', 'Cantidad de hijos', e.cantidadHijos)}
        </div>

        <h4 class="form-sec">Vehículos y licencias</h4>
        <div class="form-grid">
          ${f('f_auto', 'Automóvil', e.automovil)}
          ${f('f_licT', 'Tipo licencia automóvil', e.licenciaAutoTipo)}
          ${f('f_licV', 'Vence licencia automóvil', e.licenciaAutoVence, 'date')}
          ${f('f_moto', 'Motocicleta', e.motocicleta)}
          ${f('f_licM', 'Vence licencia motocicleta', e.licenciaMotoVence, 'date')}
        </div>

        <h4 class="form-sec">Contacto de emergencia</h4>
        <div class="form-grid">
          ${f('f_emgN', 'Contacto emergencia', e.emergencia && e.emergencia.nombre)}
          ${f('f_emgP', 'Parentesco', e.emergencia && e.emergencia.parentesco)}
          ${f('f_emgT', 'Teléfono emergencia', e.emergencia && e.emergencia.telefono)}
          <label class="f f--full"><span>Observaciones</span><textarea class="input" id="f_obs" rows="2">${U().esc(e.observaciones || '')}</textarea></label>
        </div>`;
      const mo = U().modal(html, {
        title: isNew ? 'Nuevo colaborador' : 'Editar colaborador', wide: true,
        buttons: [{ label: 'Cancelar', variant: 'ghost' }, {
          label: 'Guardar', variant: 'primary', onClick: async () => {
            const g = (id) => (document.getElementById(id).value || '').trim();
            const codigo = g('f_codigo'), nombre = g('f_nom'), ingreso = g('f_ing');
            if (!codigo || !nombre) { U().toast('Código y nombre son obligatorios', 'warn'); return true; }
            const cor = g('f_cor'); if (cor && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cor)) { U().toast('Correo corporativo inválido', 'warn'); return true; }
            // Código duplicado
            const dup = await R().employeeRepository.byCodigo(codigo);
            if (dup && dup.id !== e.id) { U().toast('Ya existe un colaborador con ese código', 'err'); return true; }
            const patch = {
              codigo, codigoJDE: g('f_jde'), nombreCompleto: nombre,
              documentoId: g('f_doc'), docEmision: g('f_docE'), docVencimiento: g('f_docV'),
              nit: g('f_nit'), seguroSocial: g('f_ss'),
              fechaNacimiento: g('f_nac'), genero: g('f_gen'), estadoCivil: g('f_ecivil'),
              escolaridad: g('f_esc'), carrera: g('f_carr'), postgrados: g('f_post'),
              especializacionTecnica: g('f_esptec'), enfermedadesCronicas: g('f_enf'),
              celular: g('f_cel'), telefonoCompania: g('f_telc'), telefonoCorporativo: g('f_telcorp'),
              telefonoCasa: g('f_telcasa'),
              correoCorporativo: cor, correoPersonal: g('f_corp'), pais: g('f_pais'),
              divGeo1: g('f_geo1'), divGeo2: g('f_geo2'), direccion: g('f_dir'),
              departamentoId: +g('f_dep') || null, puestoId: +g('f_pue') || null, tipoColaboradorId: +g('f_tip') || null,
              tipoColaborador: (tipos.find((t) => t.id === +g('f_tip')) || {}).nombre || e.tipoColaborador || '',
              fechaIngreso: ingreso, jefeNombre: g('f_jefe'), supervisorNombre: g('f_sup'),
              rol: g('f_rol'), grado: g('f_grado'), especialidad: g('f_esp'), titulo: g('f_tit'),
              sitio: g('f_sitio'), sociedad: g('f_soc'), empresa: g('f_emp'),
              centroCosto: g('f_cc'), tipoContrato: g('f_contr'), reclutador: g('f_recl'),
              agente: g('f_agente'), extensionIssabel: g('f_ext'),
              ubicacionActual: g('f_ubic'),
              nombreConyuge: g('f_conyuge'), nombrePadre: g('f_padre'), nombreMadre: g('f_madre'),
              cantidadHijos: g('f_hijos'),
              automovil: g('f_auto'), licenciaAutoTipo: g('f_licT'), licenciaAutoVence: g('f_licV'),
              motocicleta: g('f_moto'), licenciaMotoVence: g('f_licM'),
              emergencia: { nombre: g('f_emgN'), parentesco: g('f_emgP'), telefono: g('f_emgT') },
              observaciones: g('f_obs'),
            };
            if (isNew) {
              patch.estado = 'ACTIVO';
              const id = await R().employeeRepository.create(patch);
              await R().movementRepository.add({ colaboradorId: id, tipo: 'ALTA', fecha: ingreso, departamentoId: patch.departamentoId, puestoId: patch.puestoId, observaciones: 'Alta manual' });
              await R().auditRepository.add('ALTA', id, 'colaborador', '', nombre);
              U().toast('Colaborador creado');
            } else {
              // Auditoría de cambios de dep/puesto + movimientos
              if (e.departamentoId !== patch.departamentoId) { await R().movementRepository.add({ colaboradorId: e.id, tipo: 'CAMBIO_DEPARTAMENTO', departamentoId: patch.departamentoId, observaciones: 'Cambio de departamento' }); await R().auditRepository.add('CAMBIO_DEPARTAMENTO', e.id, 'departamento', e.departamentoId, patch.departamentoId); }
              if (e.puestoId !== patch.puestoId) { await R().movementRepository.add({ colaboradorId: e.id, tipo: 'CAMBIO_PUESTO', puestoId: patch.puestoId, observaciones: 'Cambio de puesto' }); await R().auditRepository.add('CAMBIO_PUESTO', e.id, 'puesto', e.puestoId, patch.puestoId); }
              await R().employeeRepository.update(e.id, patch);
              U().toast('Colaborador actualizado');
            }
            App.UI.render();
          },
        }],
      });
    }

    // ---------------- Baja (no elimina: pasa a INACTIVO) ----------------
    async function bajaForm(e) {
      const motivos = (await R().catalogRepository.byTipo('motivoBaja')).map((c) => c.valor);
      const html = `<div class="form-grid">
        <label class="f"><span>Fecha de baja *</span><input class="input" id="b_fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="f"><span>Tipo de baja</span><select class="input" id="b_tipo"><option>Voluntaria</option><option>Involuntaria</option><option>Fin de contrato</option></select></label>
        <label class="f f--full"><span>Motivo</span><input class="input" id="b_motivo" list="motivos" placeholder="Motivo de baja"><datalist id="motivos">${motivos.map((m) => `<option>${U().esc(m)}</option>`).join('')}</datalist></label>
        <label class="f f--full"><span>Observaciones</span><textarea class="input" id="b_obs" rows="2"></textarea></label></div>
        <p class="muted">La persona NO se elimina: pasa a estado <b>Inactivo</b> y conserva su historial.</p>`;
      U().modal(html, {
        title: 'Registrar baja — ' + e.nombreCompleto, wide: true,
        buttons: [{ label: 'Cancelar', variant: 'ghost' }, {
          label: 'Registrar baja', variant: 'danger', onClick: async () => {
            const fecha = document.getElementById('b_fecha').value;
            if (fecha && e.fechaIngreso && fecha < e.fechaIngreso) { U().toast('La baja no puede ser anterior al ingreso', 'err'); return true; }
            const motivo = document.getElementById('b_motivo').value.trim();
            const ant = C().antiguedad(e.fechaIngreso, App.Calc.parseDate(fecha)).text;
            await R().employeeRepository.update(e.id, { estado: 'INACTIVO', fechaBaja: fecha, tipoBaja: document.getElementById('b_tipo').value, motivoBaja: motivo });
            if (motivo) await R().catalogRepository.ensure('motivoBaja', motivo);
            await R().movementRepository.add({ colaboradorId: e.id, tipo: 'BAJA', fecha, observaciones: `${motivo || 'Baja'} · antigüedad ${ant}` });
            await R().auditRepository.add('BAJA', e.id, 'estado', 'ACTIVO', 'INACTIVO');
            U().toast('Baja registrada', 'ok'); App.UI.render();
          },
        }],
      });
    }

    async function reingreso(e) {
      const ok = await U().confirm(`¿Registrar reingreso de ${e.nombreCompleto}? Volverá a estado Activo y se conservará su historial previo.`, { title: 'Reingreso', ok: 'Registrar reingreso' });
      if (!ok) return;
      const fecha = new Date().toISOString().slice(0, 10);
      await R().employeeRepository.update(e.id, { estado: 'ACTIVO', fechaBaja: '', motivoBaja: '', tipoBaja: '', fechaIngreso: fecha });
      await R().movementRepository.add({ colaboradorId: e.id, tipo: 'REINGRESO', fecha, observaciones: 'Reingreso' });
      await R().auditRepository.add('REINGRESO', e.id, 'estado', 'INACTIVO', 'ACTIVO');
      U().toast('Reingreso registrado'); App.UI.render();
    }
  });

  function ubicLabel(u) {
    return { EN_SITIO: 'En sitio', REMOTO: 'Remoto', VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', AUSENTE: 'Ausente' }[u] || 'En sitio';
  }
  window.ubicLabel = ubicLabel;

  // Redimensiona imagen a dataURL (para IndexedDB) manteniendo proporción.
  function resizeImage(file, max) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.src = URL.createObjectURL(file);
    });
  }
})();
