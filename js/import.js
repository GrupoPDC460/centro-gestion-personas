/* ============================================================================
 * import.js — Importación de colaboradores desde XLSX/CSV
 * - Detecta la fila de encabezados aunque haya filas basura arriba.
 * - Mapea el layout real del export de Grupo PDC a campos de primera clase.
 * - Captura TODA la demás información en `extras` (nada se pierde).
 * - Por ahora asigna a todos el departamento "Cobros Venta Directa".
 * - Deduplica por "Código de Colaborador". No sobrescribe sin confirmar.
 * ==========================================================================*/
window.App = window.App || {};

App.Import = (function () {
  const Calc = App.Calc;

  // Departamento único mientras la estructura se define (instrucción vigente).
  const DEPARTAMENTO_FIJO = 'Cobros Venta Directa';

  // Alias de encabezado (normalizado, sin acentos) -> campo del modelo.
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
    'numero de telefono compania': 'telefonoCompania',
    'numero de telefono casa': 'telefonoCasa',
    'correo personal': 'correoPersonal',
    'direccion de correo corporativo': 'correoCorporativo',
    'pais': 'pais',
    'division geografica nivel 1 : departamento/estado': 'divGeo1',
    'division geografica nivel 2 : municipio/provincia': 'divGeo2',
    'division geografica nivel 3 : distrito': 'divGeo3',
    'direccion': 'direccion',
    'estado civil': 'estadoCivil',
    'documento de identificacion': 'documentoId',
    'fecha de emision documento de identificacion': 'docEmision',
    'fecha de vencimiento documento de identificacion': 'docVencimiento',
    'numero de identificacion tributaria': 'nit',
    'seguro social': 'seguroSocial',
    'nivel de escolaridad': 'escolaridad',
    'nombre de carrera universitaria': 'carrera',
    'nombres de post grados': 'postgrados',
    'especializacion tecnica': 'especializacionTecnica',
    'automovil': 'automovil',
    'motocicleta': 'motocicleta',
    'tipo de licencia automovil': 'licenciaAutoTipo',
    'fecha de vencimiento licencia de automovil': 'licenciaAutoVence',
    'fecha de vencimiento licencia de motocicleta': 'licenciaMotoVence',
    'nombre padre': 'nombrePadre',
    'nombre madre': 'nombreMadre',
    'nombre de conyuge': 'nombreConyuge',
    'cantidad de hijos': 'cantidadHijos',
    'hijo 1': 'hijo1', 'genero hijo 1': 'hijo1g',
    'hijo 2': 'hijo2', 'genero hijo 2': 'hijo2g',
    'hijo 3': 'hijo3', 'genero hijo 3': 'hijo3g',
    'hijo 4': 'hijo4', 'genero hijo 4': 'hijo4g',
    'hijo 5': 'hijo5', 'genero hijo 5': 'hijo5g',
    'enfermedades cronicas': 'enfermedadesCronicas',
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
    'transicion de compania': 'transicionCompania',
    'area 0': 'area0', 'area 1': 'area1', 'area 2': 'area2',
    'area 3': 'area3', 'area 4': 'area4', 'area final': 'areaFinal',
    'puesto': 'puesto',
    'especialidad': 'especialidad',
    'titulo': 'titulo',
    'grado': 'grado',
    'rol': 'rol',
    'equipo a cargo': 'equipoACargo',
    'equipo bono sigo': 'equipoBonoSigo',
    'nombre de reclutador': 'reclutador',
    'nombre de lider': 'jefeNombre',
    'codigo de lider': 'jefeCodigo',
    'nombre ultimo lider': 'ultimoLiderNombre',
    'codigo de ultimo lider': 'ultimoLiderCodigo',
    'primer nombre contacto de emergencia': 'emgN1',
    'segundo nombre contacto de emergencia': 'emgN2',
    'primer apellido contacto de emergencia': 'emgA1',
    'segundo apellido contacto de emergencia': 'emgA2',
    'telefono de emergencia': 'emgTel',
    'parentesco contacto de emergencia': 'emgParentesco',
    'foto de colaborador': 'fotoRef',
  };

  const NA = new Set(['no aplica', 'na aplica', 'n/a', 'na', '', 'null', 'undefined']);
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  const clean = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    return NA.has(s.toLowerCase()) ? '' : s;
  };
  const dd = (n) => String(n).padStart(2, '0');
  const fmtVal = (v) => {
    const d = Calc.parseDate(v);
    if (d) return dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + '/' + d.getFullYear();
    return clean(v);
  };
  const toISO = (v) => { const d = Calc.parseDate(v); return d ? d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate()) : ''; };

  function esRedundante(hn) {
    return (
      / - codigo de pais$/.test(hn) || / - codigo de area$/.test(hn) || / - numero$/.test(hn) ||
      /^direccion - /.test(hn) ||
      /^primer nombre/.test(hn) || /^segundo nombre/.test(hn) ||
      /^primer apellido/.test(hn) || /^segundo apellido/.test(hn) ||
      hn === 'nombre completo' || hn === 'genero'
    );
  }

  function readRows(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i] || [];
      if (r.some((c) => norm(c) === 'codigo de colaborador')) return i;
    }
    return 0;
  }

  function toRawRecords(rows) {
    const h = findHeaderRow(rows);
    const rawHeaders = rows[h] || [];
    const headers = rawHeaders.map(norm);
    const fields = headers.map((hn) => MAP[hn] || null);
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.every((c) => c == null || String(c).trim() === '')) continue;
      const rec = { __extra: [] };
      fields.forEach((f, idx) => {
        const val = row[idx];
        if (f) { rec[f] = val; return; }
        const hn = headers[idx];
        if (esRedundante(hn)) return;
        const shown = fmtVal(val);
        if (shown) rec.__extra.push({ k: String(rawHeaders[idx]).trim(), v: shown });
      });
      if (clean(rec.codigo) || clean(rec.nombreCompleto)) out.push(rec);
    }
    return out;
  }

  function toModel(rec) {
    const nombre = clean(rec.nombreCompleto) ||
      [rec.primerNombre, rec.segundoNombre, rec.primerApellido, rec.segundoApellido].map(clean).filter(Boolean).join(' ');
    const emg = [rec.emgN1, rec.emgN2, rec.emgA1, rec.emgA2].map(clean).filter(Boolean).join(' ');
    const estadoRaw = clean(rec.estadoRaw).toLowerCase();
    const estado = estadoRaw.startsWith('inact') || clean(rec.fechaBaja) ? 'INACTIVO' : 'ACTIVO';

    const hijos = [];
    for (let n = 1; n <= 5; n++) {
      const nm = clean(rec['hijo' + n]);
      if (nm) hijos.push({ nombre: nm, genero: clean(rec['hijo' + n + 'g']) });
    }

    const areaTrail = [rec.area1, rec.area2, rec.area3, rec.area4, rec.areaFinal]
      .map(clean).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

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
      telefonoCompania: clean(rec.telefonoCompania),
      telefonoCasa: clean(rec.telefonoCasa),
      correoPersonal: clean(rec.correoPersonal),
      correoCorporativo: clean(rec.correoCorporativo),
      pais: clean(rec.pais),
      divGeo1: clean(rec.divGeo1), divGeo2: clean(rec.divGeo2), divGeo3: clean(rec.divGeo3),
      direccion: clean(rec.direccion),
      estadoCivil: clean(rec.estadoCivil),
      documentoId: clean(rec.documentoId),
      docEmision: toISO(rec.docEmision), docVencimiento: toISO(rec.docVencimiento),
      nit: clean(rec.nit), seguroSocial: clean(rec.seguroSocial),
      escolaridad: clean(rec.escolaridad),
      carrera: clean(rec.carrera), postgrados: clean(rec.postgrados),
      especializacionTecnica: clean(rec.especializacionTecnica),
      automovil: clean(rec.automovil), motocicleta: clean(rec.motocicleta),
      licenciaAutoTipo: clean(rec.licenciaAutoTipo),
      licenciaAutoVence: toISO(rec.licenciaAutoVence), licenciaMotoVence: toISO(rec.licenciaMotoVence),
      nombrePadre: clean(rec.nombrePadre), nombreMadre: clean(rec.nombreMadre),
      nombreConyuge: clean(rec.nombreConyuge),
      cantidadHijos: clean(rec.cantidadHijos), hijos,
      enfermedadesCronicas: clean(rec.enfermedadesCronicas),
      departamentoNombre: DEPARTAMENTO_FIJO,
      areaFinalReal: clean(rec.areaFinal), areaTrail,
      puestoNombre: clean(rec.puesto) || 'Sin asignar',
      especialidad: clean(rec.especialidad), titulo: clean(rec.titulo),
      rol: clean(rec.rol), grado: clean(rec.grado),
      equipoACargo: clean(rec.equipoACargo), equipoBonoSigo: clean(rec.equipoBonoSigo),
      sitio: clean(rec.sitio), sociedad: clean(rec.sociedad), empresa: clean(rec.empresa),
      centroCosto: clean(rec.centroCosto), tipoContrato: clean(rec.tipoContrato),
      transicionCompania: clean(rec.transicionCompania),
      reclutador: clean(rec.reclutador),
      fechaIngreso: toISO(rec.fechaIngreso),
      fechaIngresoPrevio: toISO(rec.fechaIngresoPrevio),
      estado,
      fechaBaja: toISO(rec.fechaBaja), tipoBaja: clean(rec.tipoBaja), motivoBaja: clean(rec.motivoBaja),
      jefeNombre: clean(rec.jefeNombre), jefeCodigo: clean(rec.jefeCodigo),
      ultimoLiderNombre: clean(rec.ultimoLiderNombre), ultimoLiderCodigo: clean(rec.ultimoLiderCodigo),
      ubicacionActual: 'EN_SITIO',
      emergencia: { nombre: emg, parentesco: clean(rec.emgParentesco), telefono: clean(rec.emgTel) },
      extras: (rec.__extra || []).filter((x) => x.v),
      observaciones: '',
    };
  }

  async function analyze(file) {
    const rows = await readRows(file);
    const raw = toRawRecords(rows);
    const modelos = raw.map(toModel);
    const existentes = await App.Repos.employeeRepository.all();
    const codigos = new Set(existentes.map((e) => String(e.codigo)));
    let nuevos = 0, duplicados = 0;
    modelos.forEach((m) => { if (codigos.has(String(m.codigo))) duplicados++; else nuevos++; });
    const camposProm = modelos.length
      ? Math.round(modelos.reduce((s, m) => {
          const base = Object.keys(m).filter((k) => k !== 'extras' && clean(typeof m[k] === 'object' ? '' : m[k])).length;
          return s + base + m.extras.length;
        }, 0) / modelos.length)
      : 0;
    return { total: modelos.length, nuevos, duplicados, modelos, camposProm, columnasDetectadas: (rows[findHeaderRow(rows)] || []).length };
  }

  async function commit(modelos, modo) {
    const R = App.Repos;
    const existentes = await R.employeeRepository.all();
    const porCodigo = new Map(existentes.map((e) => [String(e.codigo), e]));
    let creados = 0, actualizados = 0, omitidos = 0;
    for (const m of modelos) {
      const depId = await R.departmentRepository.ensure(m.departamentoNombre);
      const posId = await R.positionRepository.ensure(m.puestoNombre);
      const tipId = await R.typeRepository.ensure(m.tipoColaborador);
      if (m.motivoBaja) await R.catalogRepository.ensure('motivoBaja', m.motivoBaja);
      const record = Object.assign({}, m, { departamentoId: depId, puestoId: posId, tipoColaboradorId: tipId });
      delete record.departamentoNombre; delete record.puestoNombre;

      const ex = porCodigo.get(String(m.codigo));
      if (ex) {
        if (modo === 'actualizar') { await R.employeeRepository.update(ex.id, record); actualizados++; }
        else { omitidos++; }
      } else {
        const id = await R.employeeRepository.create(record);
        await R.movementRepository.add({ colaboradorId: id, tipo: 'ALTA', fecha: m.fechaIngreso || null, departamentoId: depId, puestoId: posId, observaciones: 'Alta por importación' });
        creados++;
      }
    }
    return { creados, actualizados, omitidos };
  }

  return { readRows, analyze, commit, toModel, toRawRecords, findHeaderRow, DEPARTAMENTO_FIJO };
})();
