/* ============================================================================
 * export.js — Exportación personalizada de colaboradores
 * Permite elegir exactamente qué campos incluir y descargar en CSV o Excel.
 * ==========================================================================*/
window.App = window.App || {};

App.Exporter = (function () {
  const R = () => App.Repos, U = () => App.UI;

  // Catálogo de campos exportables, agrupados. `get` resuelve el valor.
  const GRUPOS = [
    ['Identificación', [
      ['codigo', 'Código'],
      ['codigoJDE', 'Código JDE'],
      ['nombreCompleto', 'Nombre completo'],
      ['primerNombre', 'Primer nombre'],
      ['segundoNombre', 'Segundo nombre'],
      ['primerApellido', 'Primer apellido'],
      ['segundoApellido', 'Segundo apellido'],
      ['documentoId', 'Documento (DPI)'],
      ['docVencimiento', 'Vencimiento documento'],
      ['nit', 'NIT'],
      ['seguroSocial', 'Seguro social'],
    ]],
    ['Personales', [
      ['fechaNacimiento', 'Fecha de nacimiento'],
      ['__edad', 'Edad'],
      ['genero', 'Género'],
      ['estadoCivil', 'Estado civil'],
      ['escolaridad', 'Escolaridad'],
      ['carrera', 'Carrera'],
      ['enfermedadesCronicas', 'Enfermedades crónicas'],
    ]],
    ['Contacto', [
      ['celular', 'Celular'],
      ['telefonoCorporativo', 'Teléfono corporativo'],
      ['telefonoCompania', 'Teléfono compañía'],
      ['telefonoCasa', 'Teléfono casa'],
      ['correoCorporativo', 'Correo corporativo'],
      ['correoPersonal', 'Correo personal'],
      ['pais', 'País'],
      ['divGeo1', 'Departamento/Estado'],
      ['divGeo2', 'Municipio'],
      ['direccion', 'Dirección'],
    ]],
    ['Laboral', [
      ['__departamento', 'Departamento'],
      ['__puesto', 'Puesto'],
      ['tipoColaborador', 'Tipo de colaborador'],
      ['tipoContrato', 'Tipo de contrato'],
      ['fechaIngreso', 'Fecha de ingreso'],
      ['__antiguedad', 'Antigüedad'],
      ['jefeNombre', 'Líder / jefe'],
      ['supervisorNombre', 'Supervisor'],
      ['rol', 'Rol'],
      ['grado', 'Grado'],
      ['agente', 'Agente (Issabel)'],
      ['extensionIssabel', 'Extensión Issabel'],
      ['sitio', 'Sitio'],
      ['sociedad', 'Sociedad'],
      ['centroCosto', 'Centro de costo'],
      ['reclutador', 'Reclutador'],
      ['__ubicacion', 'Situación actual'],
    ]],
    ['Estado / baja', [
      ['estado', 'Estado'],
      ['fechaBaja', 'Fecha de baja'],
      ['tipoBaja', 'Tipo de baja'],
      ['motivoBaja', 'Motivo de baja'],
    ]],
    ['Emergencia y familia', [
      ['__emgNombre', 'Contacto de emergencia'],
      ['__emgParentesco', 'Parentesco'],
      ['__emgTelefono', 'Teléfono de emergencia'],
      ['nombreConyuge', 'Cónyuge'],
      ['nombrePadre', 'Padre'],
      ['nombreMadre', 'Madre'],
      ['cantidadHijos', 'Cantidad de hijos'],
    ]],
  ];

  const UBIC = { EN_SITIO: 'En sitio', REMOTO: 'Remoto', VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', AUSENTE: 'Ausente' };

  function valor(e, campo, ctx) {
    switch (campo) {
      case '__edad': { const v = App.Calc.edad(e.fechaNacimiento); return v == null ? '' : v; }
      case '__antiguedad': return App.Calc.antiguedad(e.fechaIngreso).text || '';
      case '__departamento': return ctx.dep[e.departamentoId] || '';
      case '__puesto': return ctx.pue[e.puestoId] || '';
      case '__ubicacion': return UBIC[e.ubicacionActual] || '';
      case '__emgNombre': return (e.emergencia || {}).nombre || '';
      case '__emgParentesco': return (e.emergencia || {}).parentesco || '';
      case '__emgTelefono': return (e.emergencia || {}).telefono || '';
      case 'estado': return e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo';
      default: { const v = e[campo]; return v == null ? '' : String(v); }
    }
  }

  async function abrir() {
    const seleccion = new Set(['codigo', 'nombreCompleto', '__departamento', '__puesto', 'estado']);

    const html = `
      <p class="muted" style="margin:0 0 14px">Elige los campos que quieres incluir en la descarga.</p>
      <div class="row-gap" style="margin-bottom:12px">
        <button class="btn btn--ghost btn--sm" id="xTodos">Seleccionar todo</button>
        <button class="btn btn--ghost btn--sm" id="xNada">Quitar todo</button>
        <button class="btn btn--ghost btn--sm" id="xBasico">Solo básicos</button>
        <span class="chip" id="xCont">5 campos</span>
      </div>
      <div class="expgrid">
        ${GRUPOS.map(([titulo, campos]) => `
          <div class="expgroup">
            <h4>${titulo}</h4>
            ${campos.map(([k, l]) => `<label class="expchk"><input type="checkbox" value="${k}" ${seleccion.has(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>`).join('')}
      </div>
      <div class="form-grid" style="margin-top:16px">
        <label class="f"><span>Incluir</span>
          <select class="input" id="xQuien">
            <option value="ACTIVO">Solo activos</option>
            <option value="">Todos</option>
            <option value="INACTIVO">Solo inactivos</option>
          </select></label>
        <label class="f"><span>Formato</span>
          <select class="input" id="xFmt"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select></label>
      </div>`;

    const mo = U().modal(html, {
      title: 'Exportar colaboradores', wide: true,
      buttons: [
        { label: 'Cancelar' },
        { label: 'Descargar', variant: 'primary', onClick: () => { descargar(mo); return true; } },
      ],
    });

    const cont = mo.el.querySelector('#xCont');
    const chks = Array.from(mo.el.querySelectorAll('.expchk input'));
    const actualizar = () => {
      seleccion.clear(); chks.forEach((c) => { if (c.checked) seleccion.add(c.value); });
      cont.textContent = `${seleccion.size} campo${seleccion.size === 1 ? '' : 's'}`;
    };
    chks.forEach((c) => c.onchange = actualizar);
    mo.el.querySelector('#xTodos').onclick = () => { chks.forEach((c) => c.checked = true); actualizar(); };
    mo.el.querySelector('#xNada').onclick = () => { chks.forEach((c) => c.checked = false); actualizar(); };
    mo.el.querySelector('#xBasico').onclick = () => {
      const base = ['codigo', 'nombreCompleto', '__departamento', '__puesto', 'estado'];
      chks.forEach((c) => c.checked = base.includes(c.value)); actualizar();
    };

    async function descargar(modal) {
      if (!seleccion.size) return U().toast('Selecciona al menos un campo', 'warn');
      const filtro = modal.el.querySelector('#xQuien').value;
      const fmt = modal.el.querySelector('#xFmt').value;

      const [emps, deps, pues] = await Promise.all([
        R().employeeRepository.all(), R().departmentRepository.all(), R().positionRepository.all(),
      ]);
      const ctx = { dep: {}, pue: {} };
      deps.forEach((d) => ctx.dep[d.id] = d.nombre);
      pues.forEach((p) => ctx.pue[p.id] = p.nombre);

      const lista = emps
        .filter((e) => !filtro || e.estado === filtro)
        .sort((a, b) => String(a.nombreCompleto).localeCompare(String(b.nombreCompleto)));

      // Encabezados en el orden del catálogo
      const columnas = [];
      GRUPOS.forEach(([, campos]) => campos.forEach(([k, l]) => { if (seleccion.has(k)) columnas.push([k, l]); }));

      const filas = lista.map((e) => {
        const o = {};
        columnas.forEach(([k, l]) => { o[l] = valor(e, k, ctx); });
        return o;
      });

      const nombre = `colaboradores_${new Date().toISOString().slice(0, 10)}`;
      if (fmt === 'csv') {
        const cab = columnas.map(([, l]) => l);
        const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const csv = [cab.map(esc).join(','), ...filas.map((f) => cab.map((c) => esc(f[c])).join(','))].join('\n');
        bajar(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), nombre + '.csv');
      } else {
        const ws = XLSX.utils.json_to_sheet(filas, { header: columnas.map(([, l]) => l) });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
        XLSX.writeFile(wb, nombre + '.xlsx');
      }
      U().toast(`${filas.length} colaboradores exportados`, 'ok');
    }
  }

  function bajar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return { abrir, GRUPOS };
})();
