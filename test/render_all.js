/* Reproduce el flujo real: importa 27 colaboradores y RENDERIZA todas las vistas,
   capturando cualquier excepción (que es lo que deja el Dashboard/organigrama en blanco). */
require('fake-indexeddb/auto');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const XLSX = require('../vendor/xlsx.full.min.js');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/#dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom; const document = window.document;
window.indexedDB = global.indexedDB; window.IDBKeyRange = global.IDBKeyRange; window.XLSX = XLSX;
window.URL.createObjectURL = () => 'blob:mock'; window.URL.revokeObjectURL = () => {};
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,MOCK';
const load = (rel) => window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
['js/db.js','js/repositories.js','js/calc.js','js/charts.js','js/import.js','js/ui.js',
 'js/views/dashboard.js','js/views/employees.js','js/views/movements.js','js/views/organization.js','js/views/settings.js',
 'data/demo-seed.js','js/app.js'].forEach(load);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const A = window.App;
(async () => {
  await wait(400);
  // Importar los 27 reales
  const buf = fs.readFileSync('/mnt/user-data/uploads/demo-cobros_venta_directa.xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type:'array', cellDates:true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:true, defval:null });
  const modelos = A.Import.toRawRecords(rows).map(A.Import.toModel);
  await A.Import.commit(modelos, 'omitir');
  console.log('Importados:', (await A.Repos.employeeRepository.all()).length, 'colaboradores\n');

  const rutas = ['dashboard','empleados','organizacion','emergencia','reportes','cumpleanos','altas-bajas','rotacion','configuracion'];
  let fallos = 0;
  for (const r of rutas) {
    window.location.hash = '#' + r;
    try {
      await A.UI.render();
      const view = document.getElementById('view');
      const err = view.querySelector('.empty h3') && /Error/.test(view.querySelector('.empty h3').textContent);
      if (err) { fallos++; console.log(`  ✗ ${r.padEnd(14)} → ${view.querySelector('.empty p').textContent}`); }
      else console.log(`  ✓ ${r.padEnd(14)} → renderizó (${view.innerHTML.length} bytes)`);
    } catch (e) {
      fallos++; console.log(`  ✗ ${r.padEnd(14)} → EXCEPCIÓN: ${e.message}`);
    }
  }
  // Probar apertura de ficha (donde va la nueva UI)
  console.log('\nFicha de colaborador:');
  try {
    window.location.hash = '#empleados'; await A.UI.render();
    const emps = await A.Repos.employeeRepository.all();
    const target = emps.find(e => /^\d+$/.test(String(e.codigo)));
    // invocar click de la primera fila
    const row = document.querySelector('.rowlink');
    if (row) { row.onclick({ target: document.body }); await wait(50);
      const modal = document.querySelector('.modal');
      console.log(modal ? '  ✓ ficha abrió sin error' : '  ✗ ficha no abrió');
    } else console.log('  (no se encontró fila)');
  } catch (e) { fallos++; console.log('  ✗ EXCEPCIÓN en ficha:', e.message); }

  console.log(`\n==== ${fallos} vista(s) con error ====`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
