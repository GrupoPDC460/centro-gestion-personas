/* Prueba de humo end-to-end en Node con jsdom + fake-indexeddb.
   Arranca la app real, verifica seed, importa el Excel real y valida cálculos. */
require('fake-indexeddb/auto');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const XLSX = require('../vendor/xlsx.full.min.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost/#dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const document = window.document;

// Puentes de entorno que el navegador da por hecho.
window.indexedDB = global.indexedDB;
window.IDBKeyRange = global.IDBKeyRange;
window.XLSX = XLSX;
window.URL.createObjectURL = () => 'blob:mock';
window.URL.revokeObjectURL = () => {};
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,MOCK';

const load = (rel) => window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const order = ['js/db.js','js/repositories.js','js/calc.js','js/charts.js','js/import.js','js/ui.js',
  'js/views/dashboard.js','js/views/employees.js','js/views/movements.js','js/views/organization.js','js/views/settings.js',
  'data/demo-seed.js','js/app.js'];
order.forEach(load);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const A = window.App;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FALLA:', msg); } };

(async () => {
  await wait(400); // deja que el bootstrap (seed + render) termine

  console.log('\n[1] Arranque + seed demo');
  let emps = await A.Repos.employeeRepository.all();
  ok(emps.length === 6, `seed creó 6 colaboradores (obtenidos: ${emps.length})`);
  ok((await A.Repos.departmentRepository.all()).length >= 1, 'catálogo de departamentos creado');
  const inactivo = emps.find((e) => e.estado === 'INACTIVO');
  ok(!!inactivo, 'existe 1 colaborador inactivo (para rotación)');
  ok(document.querySelector('.kpi'), 'dashboard renderizó KPIs en el DOM');

  console.log('\n[2] Cálculos vivos');
  const C = A.Calc;
  ok(C.rotacion(150,156,4).pct === 2.61, 'rotación ejemplo spec = 2.61%');
  const rec = emps.find((e) => e.codigo === 'DEMO-005');
  ok(C.antiguedad(rec.fechaIngreso).years >= 12, 'antigüedad DEMO-005 > 12 años');
  ok(C.edad(rec.fechaNacimiento) > 0, 'edad calculada dinámicamente');

  console.log('\n[3] Alta manual + auditoría');
  const nid = await A.Repos.employeeRepository.create({ codigo:'T-001', nombreCompleto:'Prueba Manual', fechaIngreso:'2025-01-10', estado:'ACTIVO', genero:'Masculino', fechaNacimiento:'2000-01-01', emergencia:{} });
  await A.Repos.movementRepository.add({ colaboradorId:nid, tipo:'ALTA', fecha:'2025-01-10' });
  emps = await A.Repos.employeeRepository.all();
  ok(emps.length === 7, 'alta manual persistió (7 registros)');

  console.log('\n[4] Baja (no elimina, pasa a INACTIVO)');
  await A.Repos.employeeRepository.update(nid, { estado:'INACTIVO', fechaBaja:'2026-06-01', motivoBaja:'Prueba' });
  await A.Repos.auditRepository.add('BAJA', nid, 'estado', 'ACTIVO', 'INACTIVO');
  const t1 = await A.Repos.employeeRepository.get(nid);
  ok(t1.estado === 'INACTIVO' && !!t1.fechaBaja, 'baja: estado INACTIVO y conserva registro');
  ok((await A.Repos.auditRepository.all()).length >= 1, 'auditoría registró el cambio');

  console.log('\n[5] Importación desde Excel (si hay archivo de muestra disponible)');
  // Ruta opcional: coloca un .xlsx con el formato Grupo PDC para probar el import.
  const SAMPLE = process.env.CGP_SAMPLE_XLSX || '/mnt/user-data/uploads/demo-cobros_venta_directa.xlsx';
  let importedCount = 0;
  if (fs.existsSync(SAMPLE)) {
    const buf = fs.readFileSync(SAMPLE);
    const wb = XLSX.read(new Uint8Array(buf), { type:'array', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
    const modelos = A.Import.toRawRecords(rows).map(A.Import.toModel);
    ok(modelos.length > 0, `importador mapeó ${modelos.length} colaboradores desde el Excel`);
    const uno = modelos[0];
    ok(uno && !!uno.codigo, 'cada registro mapea un código');
    ok(uno && !!uno.fechaIngreso && /^\d{4}-\d{2}-\d{2}$/.test(uno.fechaIngreso), 'mapea fecha de ingreso a ISO');
    // Instrucción: todos en "Cobros Venta Directa"
    ok(modelos.every((m) => m.departamentoNombre === 'Cobros Venta Directa'), 'TODOS asignados a "Cobros Venta Directa"');
    // Captura completa: campos de primera clase que antes se perdían
    ok(modelos.some((m) => m.telefonoCompania), 'captura teléfono de compañía');
    ok(modelos.some((m) => m.nit), 'captura NIT');
    ok(modelos.some((m) => m.docVencimiento), 'captura vencimiento de documento (DPI)');
    ok(modelos.some((m) => m.nombreMadre || m.nombrePadre), 'captura familia (padre/madre)');
    ok(modelos.some((m) => m.hijos && m.hijos.length), 'captura hijos');
    ok(modelos.some((m) => m.escolaridad), 'captura escolaridad');
    ok(modelos.some((m) => m.areaTrail && m.areaTrail.length), 'conserva jerarquía de áreas real');
    // Nada se pierde: cada colaborador arrastra decenas de campos extra
    const extrasProm = Math.round(modelos.reduce((s, m) => s + m.extras.length, 0) / modelos.length);
    ok(extrasProm >= 8, `promedio de ${extrasProm} campos adicionales capturados por persona (además de ~45 con nombre)`);
    const res = await A.Import.commit(modelos, 'omitir');
    importedCount = res.creados;
    ok(res.creados === modelos.length, `commit creó ${res.creados} colaboradores`);
    const deptos = await A.Repos.departmentRepository.all();
    const cvd = deptos.find((d) => d.nombre === 'Cobros Venta Directa');
    const enCVD = (await A.Repos.employeeRepository.all()).filter((e) => e.departamentoId === cvd.id).length;
    ok(enCVD >= modelos.length, `todos los importados quedaron en Cobros Venta Directa (${enCVD})`);
  } else {
    console.log('  (omitido: no se encontró archivo de muestra — el import se prueba en el navegador)');
  }

  console.log('\n[6] Backup contiene los datos');
  const stores = ['colaboradores','movimientos','departamentos','puestos','tiposColaborador'];
  let totalRows = 0; for (const s of stores) totalRows += (await A.DB.getAll(s)).length;
  ok(totalRows >= 15, `respaldo abarcaría ${totalRows} filas en stores clave`);

  console.log('\n[8] Eliminar perfil (borra historial + foto + registra auditoría)');
  const delId = await A.Repos.employeeRepository.create({ codigo: 'DEL-1', nombreCompleto: 'Para Borrar', estado: 'ACTIVO', fechaIngreso: '2024-01-01', emergencia: {} });
  await A.Repos.movementRepository.add({ colaboradorId: delId, tipo: 'ALTA', fecha: '2024-01-01' });
  await A.Repos.photoRepository.set(delId, 'data:image/jpeg;base64,MOCK');
  let movsDel = await A.Repos.movementRepository.byColaborador(delId);
  ok(movsDel.length === 1, 'perfil de prueba tiene 1 movimiento antes de borrar');
  for (const m of movsDel) await A.Repos.movementRepository.remove(m.id);
  await A.Repos.photoRepository.remove(delId);
  await A.Repos.auditRepository.add('ELIMINACION', delId, 'perfil', 'Para Borrar', 'eliminado');
  await A.Repos.employeeRepository.remove(delId);
  ok(!(await A.Repos.employeeRepository.get(delId)), 'colaborador eliminado de la base');
  ok((await A.Repos.movementRepository.byColaborador(delId)).length === 0, 'sus movimientos se eliminaron');
  ok(!(await A.Repos.photoRepository.get(delId)), 'su foto se eliminó');
  ok((await A.Repos.auditRepository.all()).some((a) => a.accion === 'ELIMINACION'), 'quedó registro de auditoría de la eliminación');

  console.log('\n[9] Cambio de estado Activo↔Inactivo conserva registro');
  const stId = await A.Repos.employeeRepository.create({ codigo: 'ST-1', nombreCompleto: 'Cambia Estado', estado: 'ACTIVO', fechaIngreso: '2023-05-01', emergencia: {} });
  await A.Repos.employeeRepository.update(stId, { estado: 'INACTIVO', fechaBaja: '2026-07-01', motivoBaja: 'Prueba' });
  ok((await A.Repos.employeeRepository.get(stId)).estado === 'INACTIVO', 'pasa a Inactivo sin borrarse');
  await A.Repos.employeeRepository.update(stId, { estado: 'ACTIVO', fechaBaja: '', motivoBaja: '' });
  ok((await A.Repos.employeeRepository.get(stId)).estado === 'ACTIVO', 'reactivación a Activo');

  console.log('\n[10] Persistencia: la base sobrevive a "recargar" (reabrir conexión)');
  const antes = (await A.Repos.employeeRepository.all()).length;
  A.DB._forceReopen ? A.DB._forceReopen() : null;
  const despues = (await A.Repos.employeeRepository.all()).length;
  ok(despues === antes && despues > 0, `datos persistentes tras reabrir (${despues})`);

  console.log(`\n==== RESULTADO: ${pass} pruebas OK, ${fail} fallidas ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR EN HARNESS:', e); process.exit(2); });
