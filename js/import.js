/* ============================================================================
 * import.js — Importación de colaboradores desde XLSX/CSV
 * - Detecta la fila de encabezados aunque haya filas basura arriba.
 * - Mapea automáticamente el layout real del export de Grupo PDC.
 * - Deduplica por "Código de Colaborador". No sobrescribe sin confirmar.
 * ==========================================================================*/
window.App = window.App || {};

App.Import = (function () {
  const Calc = App.Calc;

  // Alias de encabezado (normalizado) -> campo del modelo
  const MAP = {
    'codigo de colaborador': 'codigo',
    'codigo jde': 'codigoJDE',
    'tipo de colaborador': 'tipoColaborador',
    'primer nombre': 'primerNombre',
    'segundo nombre': 'segundoNombre',
    'primer apellido': 'primerApellido',
    'segundo apellido': 'segundoApellido',
    'nombre completo': 'nombreCompleto',
    'fecha de nacimiento': 'fechaNacimiento',
    'genero': 'genero',
    'numero de celular personal': 'celular',
    'correo personal': 'correoPersonal',
    'direccion de correo corporativo': 'correoCorporativo',
    'correo corporativo': 'correoCorporativoFlag',
    'pais': 'pais',
    'division geografica nivel 1 : departamento/estado': 'divGeo1',
    'division geografica nivel 2 : municipio/provincia': 'divGeo2',
    'division geografica nivel 3 : distrito': 'divGeo3',
    'direccion': 'direccion',
    'estado civil': 'estadoCivil',
    'documento de identificacion': 'documentoId',
    'estado': 'estadoRaw',
    'fecha de ingreso': 'fechaIngreso',
    'fecha de ingreso previo': 'fechaIngresoPrevio',
    'fecha de baja': 'fechaBaja',
    'tipo de baja': 'tipoBaja',
    'motivo de baja': 'motivoBaja',
    'sitio': 'sitio',
    'sociedad': 'sociedad',
    'empresa': 'empresa',
    'centro de costo': 'centroCosto',
    'tipo de contrato': 'tipoContrato',
    'area final': 'areaFinal',
    'area 2': 'area2',
    'area 3': 'area3',
    'puesto': 'puesto',
    'rol': 'rol',
    'grado': 'grado',
    'nombre de lider': 'jefeNombre',
    'codigo de lider': 'jefeCodigo',
    // Emergencia
    'primer nombre contacto de emergencia': 'emgN1',
    'segundo nombre contacto de emergencia': 'emgN2',
    'primer apellido contacto de emergencia': 'emgA1',
    'segundo apellido contacto de emergencia': 'emgA2',
    'telefono de emergencia': 'emgTel',
    'parentesco contacto de emergencia': 'emgParentesco',
    'nivel de escolaridad': 'escolaridad',
    'foto de colaborador': 'fotoRef',
  };

  const NA = new Set(['no aplica', 'na aplica', 'n/a', 'na', '', 'null', 'undefined', '0']);
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ');
  const clean = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    return NA.has(s.toLowerCase()) ? '' : s;
  };
  const toISO = (v) => { const d = Calc.parseDate(v); return d ? d.toISOString().slice(0, 10) : ''; };

  // Lee un File y devuelve matriz de filas (array de arrays).
  function readRows(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // Localiza la fila de encabezados (la que contiene "Código de Colaborador").
  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i] || [];
      if (r.some((c) => norm(c) === 'codigo de colaborador')) return i;
    }
    return 0;
  }

  // Convierte matriz -> registros crudos {campo: valor} usando MAP.
  function toRawRecords(rows) {
    const h = findHeaderRow(rows);
    const headers = (rows[h] || []).map(norm);
    const fields = headers.map((hn) => MAP[hn] || null);
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.every((c) => c == null || String(c).trim() === '')) continue;
      const rec = {};
      fields.forEach((f, idx) => { if (f) rec[f] = row[idx]; });
      if (clean(rec.codigo) || clean(rec.nombreCompleto)) out.push(rec);
    }
    return out;
  }

  // Normaliza un registro crudo al modelo de colaborador de la app.
  function toModel(rec) {
    const nombre = clean(rec.nombreCompleto) ||
      [rec.primerNombre, rec.segundoNombre, rec.primerApellido, rec.segundoApellido].map(clean).filter(Boolean).join(' ');
    const emg = [rec.emgN1, rec.emgN2, rec.emgA1, rec.emgA2].map(clean).filter(Boolean).join(' ');
    const estadoRaw = clean(rec.estadoRaw).toLowerCase();
    const estado = estadoRaw.startsWith('inact') || clean(rec.fechaBaja) ? 'INACTIVO' : 'ACTIVO';
    const sitio = clean(rec.sitio);
    const ubic = /oficina/i.test(sitio) ? 'EN_SITIO' : (sitio ? 'EN_SITIO' : 'EN_SITIO');
    return {
      codigo: clean(rec.codigo),
      codigoJDE: clean(rec.codigoJDE),
      tipoColaborador: clean(rec.tipoColaborador) || 'Interno',
      nombreCompleto: nombre,
      primerNombre: clean(rec.primerNombre), segundoNombre: clean(rec.segundoNombre),
      primerApellido: clean(rec.primerApellido), segundoApellido: clean(rec.segundoApellido),
      fechaNacimiento: toISO(rec.fechaNacimiento),
      genero: clean(rec.genero),
      celular: clean(rec.celular),
      correoPersonal: clean(rec.correoPersonal),
      correoCorporativo: clean(rec.correoCorporativo),
      pais: clean(rec.pais),
      divGeo1: clean(rec.divGeo1), divGeo2: clean(rec.divGeo2), divGeo3: clean(rec.divGeo3),
      direccion: clean(rec.direccion),
      estadoCivil: clean(rec.estadoCivil),
      documentoId: clean(rec.documentoId),
      escolaridad: clean(rec.escolaridad),
      // laboral
      departamentoNombre: clean(rec.areaFinal) || clean(rec.area3) || 'Sin asignar',
      puestoNombre: clean(rec.puesto) || 'Sin asignar',
      rol: clean(rec.rol), grado: clean(rec.grado),
      sitio, sociedad: clean(rec.sociedad), empresa: clean(rec.empresa),
      centroCosto: clean(rec.centroCosto), tipoContrato: clean(rec.tipoContrato),
      fechaIngreso: toISO(rec.fechaIngreso),
      estado,
      fechaBaja: toISO(rec.fechaBaja), tipoBaja: clean(rec.tipoBaja), motivoBaja: clean(rec.motivoBaja),
      jefeNombre: clean(rec.jefeNombre), jefeCodigo: clean(rec.jefeCodigo),
      ubicacionActual: ubic,
      emergencia: { nombre: emg, parentesco: clean(rec.emgParentesco), telefono: clean(rec.emgTel) },
      observaciones: '',
    };
  }

  // Analiza el archivo y devuelve preview + duplicados (sin escribir aún).
  async function analyze(file) {
    const rows = await readRows(file);
    const raw = toRawRecords(rows);
    const modelos = raw.map(toModel);
    const existentes = await App.Repos.employeeRepository.all();
    const codigosExistentes = new Set(existentes.map((e) => String(e.codigo)));
    let nuevos = 0, duplicados = 0;
    modelos.forEach((m) => { if (codigosExistentes.has(String(m.codigo))) duplicados++; else nuevos++; });
    return { total: modelos.length, nuevos, duplicados, modelos, columnasDetectadas: (rows[findHeaderRow(rows)] || []).length };
  }

  // Confirma e importa. modo: 'omitir' (default) o 'actualizar' duplicados.
  async function commit(modelos, modo) {
    const R = App.Repos;
    const existentes = await R.employeeRepository.all();
    const porCodigo = new Map(existentes.map((e) => [String(e.codigo), e]));
    let creados = 0, actualizados = 0, omitidos = 0;
    for (const m of modelos) {
      // Resolver catálogos (crea si no existen).
      const depId = await R.departmentRepository.ensure(m.departamentoNombre);
      const posId = await R.positionRepository.ensure(m.puestoNombre);
      const tipId = await R.typeRepository.ensure(m.tipoColaborador);
      if (m.motivoBaja) await R.catalogRepository.ensure('motivoBaja', m.motivoBaja);
      const record = Object.assign({}, m, { departamentoId: depId, puestoId: posId, tipoColaboradorId: tipId });
      delete record.departamentoNombre; delete record.puestoNombre;

      const ex = porCodigo.get(String(m.codigo));
      if (ex) {
        if (modo === 'actualizar') {
          await R.employeeRepository.update(ex.id, record);
          actualizados++;
        } else { omitidos++; }
      } else {
        const id = await R.employeeRepository.create(record);
        // Movimiento ALTA con la fecha de ingreso real.
        await R.movementRepository.add({ colaboradorId: id, tipo: 'ALTA', fecha: m.fechaIngreso || null, departamentoId: depId, puestoId: posId, observaciones: 'Alta por importación' });
        creados++;
      }
    }
    return { creados, actualizados, omitidos };
  }

  return { readRows, analyze, commit, toModel, toRawRecords, findHeaderRow };
})();
