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
  ok((await A.Repos.departmentRepository.all()).length >= 3, 'catálogo de departamentos creado');
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
    ok(uno && !!uno.departamentoNombre, 'mapea departamento (Área Final)');
    ok(uno && !!uno.fechaIngreso && /^\d{4}-\d{2}-\d{2}$/.test(uno.fechaIngreso), 'mapea fecha de ingreso a ISO');
    const res = await A.Import.commit(modelos, 'omitir');
    importedCount = res.creados;
    ok(res.creados === modelos.length, `commit creó ${res.creados} colaboradores`);
  } else {
    console.log('  (omitido: no se encontró archivo de muestra — el import se prueba en el navegador)');
  }

  console.log('\n[6] Backup contiene los datos');
  const stores = ['colaboradores','movimientos','departamentos','puestos','tiposColaborador'];
  let totalRows = 0; for (const s of stores) totalRows += (await A.DB.getAll(s)).length;
  ok(totalRows >= 15, `respaldo abarcaría ${totalRows} filas en stores clave`);

  console.log('\n[7] Cálculos agregados sobre la base');
  emps = await A.Repos.employeeRepository.all();
  const conAntig = emps.filter((e) => C.antiguedad(e.fechaIngreso).totalDays > 0).length;
  ok(conAntig >= 6, `antigüedad calculada para ${conAntig} colaboradores`);
  ok(new Set(emps.map((e) => e.pais)).size >= 1, 'agrupación por país disponible');

  console.log(`\n==== RESULTADO: ${pass} pruebas OK, ${fail} fallidas ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR EN HARNESS:', e); process.exit(2); });
