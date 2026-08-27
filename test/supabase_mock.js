/* Valida js/db.js (Supabase) con un cliente PostgREST simulado en memoria. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const ROOT = path.join(__dirname, '..');

// ---- Cliente Supabase simulado (subset de PostgREST que usa db.js) ----
function makeClient() {
  const tables = {};
  const seq = {};
  const ensureT = (t) => { if (!tables[t]) { tables[t] = []; seq[t] = 0; } return tables[t]; };
  class Q {
    constructor(t) { this.t = t; this.op = 'select'; this.cols = '*'; this.filters = []; this.payload = null; this._single = false; this._maybe = false; }
    select(c) { this.cols = c; return this; }
    insert(r) { this.op = 'insert'; this.payload = r; return this; }
    upsert(r) { this.op = 'upsert'; this.payload = r; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push(['eq', c, v]); return this; }
    not(c, _op, _v) { this.filters.push(['notnull', c]); return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._maybe = true; return this; }
    _match(row) {
      return this.filters.every(([op, c, v]) => op === 'notnull' ? row[c] != null : String(row[c]) === String(v));
    }
    _pkOf(t) { return t === 'cgp_config' ? 'key' : 'id'; }
    _run() {
      const arr = ensureT(this.t); const pk = this._pkOf(this.t);
      try {
        if (this.op === 'select') {
          let rows = arr.filter((r) => this._match(r));
          if (this._single) return { data: rows[0], error: rows[0] ? null : { message: 'no rows' } };
          if (this._maybe) return { data: rows[0] || null, error: null };
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        if (this.op === 'insert' || this.op === 'upsert') {
          const list = Array.isArray(this.payload) ? this.payload : [this.payload];
          const out = [];
          for (const row of list) {
            let key = row[pk];
            if (key == null) { key = (++seq[this.t]); }
            const existing = arr.find((r) => String(r[pk]) === String(key));
            if (existing && this.op === 'upsert') { Object.assign(existing, row, { [pk]: key }); out.push(existing); }
            else { const nr = { ...row, [pk]: key }; arr.push(nr); if (key > seq[this.t]) seq[this.t] = key; out.push(nr); }
          }
          const sel = out.map((r) => ({ [pk]: r[pk] }));
          if (this._single) return { data: sel[0], error: null };
          return { data: sel, error: null };
        }
        if (this.op === 'delete') {
          const keep = arr.filter((r) => !this._match(r));
          tables[this.t] = keep;
          return { data: null, error: null };
        }
      } catch (e) { return { data: null, error: { message: e.message } }; }
    }
    then(res, rej) { try { res(this._run()); } catch (e) { rej(e); } }
  }
  return { from: (t) => new Q(t), _tables: tables, auth: { getSession: async () => ({ data: { session: null } }) } };
}

// ---- Cargar módulos en un contexto tipo navegador ----
const sandbox = { window: {}, console, setTimeout, Date, Math, JSON, XLSX, Promise, String, Number, Object, Array, RegExp, isNaN, parseInt, parseFloat };
sandbox.window.App = {};
sandbox.App = sandbox.window.App;
sandbox.window.supabase = { createClient: () => makeClient() };
vm.createContext(sandbox);
const run = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
sandbox.App.CONFIG = { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'y' };
run('js/config.js'); // sobrescribe CONFIG (ok)
sandbox.App.CONFIG = { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'y' };
run('js/supabase.js');
sandbox.App.SB = makeClient(); // cliente simulado directo
run('js/calc.js'); run('js/db.js'); run('js/repositories.js'); run('js/import.js');

const A = sandbox.App;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FALLA:', m); } };

(async () => {
  console.log('[1] Catálogos + colaborador');
  const dep = await A.Repos.departmentRepository.ensure('Cobros Venta Directa');
  const dep2 = await A.Repos.departmentRepository.ensure('Cobros Venta Directa'); // no duplica
  ok(dep === dep2, 'ensure no duplica departamento');
  const id = await A.Repos.employeeRepository.create({ codigo: 'X1', nombreCompleto: 'Uno', departamentoId: dep, estado: 'ACTIVO', fechaIngreso: '2020-01-01' });
  ok(!!id, 'crea colaborador y devuelve id');
  const got = await A.Repos.employeeRepository.get(id);
  ok(got && got.nombreCompleto === 'Uno' && got.id === id, 'get devuelve objeto con id y campos');

  console.log('[2] Update + byIndex');
  await A.Repos.employeeRepository.update(id, { estado: 'INACTIVO', fechaBaja: '2026-01-01' });
  const g2 = await A.Repos.employeeRepository.get(id);
  ok(g2.estado === 'INACTIVO' && g2.codigo === 'X1', 'update conserva campos y aplica patch');
  const byCod = await A.Repos.employeeRepository.byCodigo('X1');
  ok(byCod && byCod.id === id, 'byCodigo (byIndex) encuentra');
  const mid = await A.Repos.movementRepository.add({ colaboradorId: id, tipo: 'ALTA', fecha: '2020-01-01' });
  ok(!!mid, 'agrega movimiento');
  const movs = await A.Repos.movementRepository.byColaborador(id);
  ok(movs.length === 1, 'byColaborador filtra por índice');

  console.log('[3] Config (tabla con value)');
  await A.Repos.settingsRepository.set('seeded', true);
  ok((await A.Repos.settingsRepository.get('seeded')) === true, 'config set/get con columna value');

  console.log('[4] Fotos (pk explícito)');
  await A.Repos.photoRepository.set(id, 'data:img');
  ok((await A.Repos.photoRepository.get(id)).dataUrl === 'data:img', 'foto guardada/leída por id');

  console.log('[5] Importación de 27 reales -> Supabase (simulado)');
  const buf = fs.readFileSync('/mnt/user-data/uploads/demo-cobros_venta_directa.xlsx');
  const rows = XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true }).Sheets['Hoja1'], { header: 1, raw: true, defval: null });
  const modelos = A.Import.toRawRecords(rows).map(A.Import.toModel);
  const res = await A.Import.commit(modelos, 'omitir');
  ok(res.creados === 27, `commit creó 27 (${res.creados})`);
  const todos = await A.Repos.employeeRepository.all();
  ok(todos.length === 28, `total 28 (1 previo + 27) = ${todos.length}`);
  ok(todos.every((e) => typeof e.id !== 'undefined'), 'todos los colaboradores tienen id');
  const cvd = (await A.Repos.departmentRepository.all()).find((d) => d.nombre === 'Cobros Venta Directa');
  ok(todos.filter((e) => e.departamentoId === cvd.id).length >= 27, 'importados quedan en Cobros Venta Directa');

  console.log('[6] Eliminar + clearAll');
  await A.Repos.employeeRepository.remove(id);
  ok(!(await A.Repos.employeeRepository.get(id)), 'eliminación por id');
  await A.DB.clearAll();
  ok((await A.Repos.employeeRepository.all()).length === 0, 'clearAll vacía la tabla');

  console.log(`\n==== ${pass} OK, ${fail} fallidas ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(2); });
