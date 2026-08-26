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
      <div class="toolbar">
        <input id="buscar" class="input input--search" placeholder="Buscar por nombre, código, JDE, correo o teléfono…" autocomplete="off">
        <select id="fDep" class="input"><option value="">Todos los departamentos</option>${deptos.map((d) => `<option value="${d.id}">${U().esc(d.nombre)}</option>`).join('')}</select>
        <select id="fPue" class="input"><option value="">Todos los puestos</option>${puestos.map((d) => `<option value="${d.id}">${U().esc(d.nombre)}</option>`).join('')}</select>
        <select id="fEst" class="input"><option value="">Estado: todos</option><option value="ACTIVO">Activos</option><option value="INACTIVO">Inactivos</option></select>
        <select id="fGen" class="input"><option value="">Género: todos</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option></select>
        <select id="fAnt" class="input"><option value="">Antigüedad: toda</option>${Object.entries(C().CAT_ANTIGUEDAD).filter(([k]) => k !== 'sin_dato').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
      <div id="tabla" class="table-wrap"></div>`;

    const st = { q: '', dep: '', pue: '', est: '', gen: '', ant: '' };
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
      document.getElementById('cont').textContent = list.length;
      if (!list.length) { document.getElementById('tabla').innerHTML = '<div class="empty"><h3>Sin resultados</h3><p>Ajusta los filtros o la búsqueda.</p></div>'; return; }
      const rows = await Promise.all(list.map(async (e) => {
        const ant = C().antiguedad(e.fechaIngreso);
        return `<tr data-id="${e.id}" class="rowlink">
          <td class="cell-person">${await U().avatarHTML(e, 36)}<div><b>${U().esc(e.nombreCompleto)}</b><span class="muted">${U().esc(e.correoCorporativo || e.correoPersonal || '')}</span></div></td>
          <td>${U().esc(e.codigo)}<span class="muted"> · JDE ${U().esc(e.codigoJDE || '—')}</span></td>
          <td>${U().esc(depName[e.departamentoId] || '—')}</td>
          <td>${U().esc(posName[e.puestoId] || '—')}</td>
          <td>${ant.text}</td>
          <td><span class="badge badge--${e.estado === 'ACTIVO' ? 'ok' : 'off'}">${e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</span></td>
        </tr>`;
      }));
      document.getElementById('tabla').innerHTML = `<table class="table"><thead><tr>
        <th>Colaborador</th><th>Código</th><th>Departamento</th><th>Puesto</th><th>Antigüedad</th><th>Estado</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table>`;
      document.querySelectorAll('.rowlink').forEach((tr) => tr.onclick = () => ficha(+tr.dataset.id));
    }

    document.getElementById('buscar').oninput = (e) => { st.q = e.target.value; pintar(); };
    document.getElementById('fDep').onchange = (e) => { st.dep = e.target.value; pintar(); };
    document.getElementById('fPue').onchange = (e) => { st.pue = e.target.value; pintar(); };
    document.getElementById('fEst').onchange = (e) => { st.est = e.target.value; pintar(); };
    document.getElementById('fGen').onchange = (e) => { st.gen = e.target.value; pintar(); };
    document.getElementById('fAnt').onchange = (e) => { st.ant = e.target.value; pintar(); };
    document.getElementById('nuevoBtn').onclick = () => form(null);
    await pintar();
    if (params && params.id) ficha(+params.id);

    // ---------------- Ficha / perfil ----------------
    async function ficha(id) {
      const e = await R().employeeRepository.get(id);
      if (!e) return;
      const ant = C().antiguedad(e.fechaIngreso), edad = C().edad(e.fechaNacimiento);
      const movs = (await R().movementRepository.byColaborador(id)).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      const av = await U().avatarHTML(e, 92);
      const line = (l, v) => `<div class="fld"><span class="fld__l">${l}</span><span class="fld__v">${U().esc(v || '—')}</span></div>`;
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
          </div>
          <div class="cols cols--2">
            <div class="card"><h3 class="card__title">Información personal</h3>
              ${line('Código', e.codigo)}${line('Código JDE', e.codigoJDE)}${line('Documento', e.documentoId)}
              ${line('Nacimiento', U().fechaCorta(e.fechaNacimiento) + (edad != null ? ` (${edad} años)` : ''))}
              ${line('Género', e.genero)}${line('Estado civil', e.estadoCivil)}${line('Escolaridad', e.escolaridad)}
              ${line('Celular', e.celular)}${line('Correo personal', e.correoPersonal)}
              ${line('País', e.pais)}${line('Dirección', e.direccion)}</div>
            <div class="card"><h3 class="card__title">Información laboral</h3>
              ${line('Departamento', depName(e))}${line('Puesto', posName(e))}${line('Rol', e.rol)}${line('Grado', e.grado)}
              ${line('Tipo', e.tipoColaborador)}${line('Ingreso', U().fechaCorta(e.fechaIngreso))}
              ${line('Antigüedad', ant.text)}${line('Jefe inmediato', e.jefeNombre)}
              ${line('Sitio', e.sitio)}${line('Sociedad', e.sociedad)}${line('Estado actual', ubicLabel(e.ubicacionActual))}
              ${e.estado === 'INACTIVO' ? line('Fecha de baja', U().fechaCorta(e.fechaBaja)) + line('Motivo', e.motivoBaja) : ''}</div>
          </div>
          <div class="cols cols--2">
            <div class="card"><h3 class="card__title">Contacto de emergencia</h3>
              ${line('Contacto', e.emergencia && e.emergencia.nombre)}${line('Parentesco', e.emergencia && e.emergencia.parentesco)}${line('Teléfono', e.emergencia && e.emergencia.telefono)}</div>
            <div class="card"><h3 class="card__title">Historial de movimientos</h3>
              ${movs.length ? movs.map((m) => `<div class="mv"><span class="mv__tag mv__tag--${m.tipo}">${U().esc(m.tipo.replace('_', ' '))}</span><span>${U().fechaCorta(m.fecha)}</span><span class="muted">${U().esc(m.observaciones || '')}</span></div>`).join('') : '<p class="muted">Sin movimientos.</p>'}</div>
          </div>
        </div>`;
      const mo = U().modal(html, { title: 'Ficha del colaborador', wide: true });

      function depName(x) { return (deptos.find((d) => d.id === x.departamentoId) || {}).nombre || '—'; }
      function posName(x) { return (puestos.find((d) => d.id === x.puestoId) || {}).nombre || '—'; }

      mo.el.querySelector('#editBtn').onclick = () => { mo.close(); form(e); };
      mo.el.querySelector('#copyTel').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(e.celular || ''); U().toast('Teléfono copiado'); };
      const bb = mo.el.querySelector('#bajaBtn'); if (bb) bb.onclick = () => { mo.close(); bajaForm(e); };
      const rb = mo.el.querySelector('#reingBtn'); if (rb) rb.onclick = () => { mo.close(); reingreso(e); };
      // Foto
      const phBtn = mo.el.querySelector('#phBtn'), phInput = mo.el.querySelector('#phInput');
      phBtn.onclick = () => phInput.click();
      phInput.onchange = async () => {
        const f = phInput.files[0]; if (!f) return;
        if (!/image\/(png|jpe?g|webp)/.test(f.type)) return U().toast('Formato no permitido', 'warn');
        const dataUrl = await resizeImage(f, 400);
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
      const html = `<div class="form-grid">
        ${f('f_codigo', 'Código', e.codigo, 'text', true)}
        ${f('f_jde', 'Código JDE', e.codigoJDE)}
        ${f('f_nom', 'Nombre completo', e.nombreCompleto, 'text', true)}
        ${f('f_nac', 'Fecha de nacimiento', e.fechaNacimiento, 'date')}
        <label class="f"><span>Género</span><select class="input" id="f_gen"><option value="">—</option><option ${/^m/i.test(e.genero) ? 'selected' : ''}>Masculino</option><option ${/^f/i.test(e.genero) ? 'selected' : ''}>Femenino</option></select></label>
        ${f('f_cel', 'Celular', e.celular)}
        ${f('f_cor', 'Correo corporativo', e.correoCorporativo, 'email')}
        ${f('f_corp', 'Correo personal', e.correoPersonal, 'email')}
        ${f('f_pais', 'País', e.pais)}
        <label class="f"><span>Departamento</span><select class="input" id="f_dep">${opt(deptos, e.departamentoId, true)}</select></label>
        <label class="f"><span>Puesto</span><select class="input" id="f_pue">${opt(puestos, e.puestoId, true)}</select></label>
        <label class="f"><span>Tipo</span><select class="input" id="f_tip">${opt(tipos, e.tipoColaboradorId, true)}</select></label>
        ${f('f_ing', 'Fecha de ingreso', e.fechaIngreso, 'date', true)}
        ${f('f_jefe', 'Jefe inmediato', e.jefeNombre)}
        <label class="f"><span>Estado actual</span><select class="input" id="f_ubic">${['EN_SITIO', 'REMOTO', 'VACACIONES', 'PERMISO', 'INCAPACIDAD', 'AUSENTE'].map((u) => `<option value="${u}" ${e.ubicacionActual === u ? 'selected' : ''}>${ubicLabel(u)}</option>`).join('')}</select></label>
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
              fechaNacimiento: g('f_nac'), genero: g('f_gen'), celular: g('f_cel'),
              correoCorporativo: cor, correoPersonal: g('f_corp'), pais: g('f_pais'),
              departamentoId: +g('f_dep') || null, puestoId: +g('f_pue') || null, tipoColaboradorId: +g('f_tip') || null,
              tipoColaborador: (tipos.find((t) => t.id === +g('f_tip')) || {}).nombre || e.tipoColaborador || '',
              fechaIngreso: ingreso, jefeNombre: g('f_jefe'), ubicacionActual: g('f_ubic'),
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
