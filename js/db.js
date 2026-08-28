/* ============================================================================
 * db.js — Capa de datos sobre Supabase (PostgreSQL)
 * Mantiene EXACTAMENTE la misma API que la versión IndexedDB, de modo que los
 * repositorios y las vistas no cambian. Modelo documento: cada fila guarda el
 * objeto en `doc` (jsonb) + su llave primaria; en config se usa `value`.
 * La seguridad la aplica el RLS de Supabase (solo usuarios autorizados).
 * ==========================================================================*/
window.App = window.App || {};

App.DB = (function () {
  const SB = () => App.SB;

  // store lógico -> tabla física
  const STORES = {
    colaboradores:    { table: 'cgp_colaboradores',    pk: 'id',  auto: true },
    fotos:            { table: 'cgp_fotos',            pk: 'id',  auto: false },
    movimientos:      { table: 'cgp_movimientos',      pk: 'id',  auto: true },
    departamentos:    { table: 'cgp_departamentos',    pk: 'id',  auto: true },
    puestos:          { table: 'cgp_puestos',          pk: 'id',  auto: true },
    tiposColaborador: { table: 'cgp_tipos_colaborador', pk: 'id', auto: true },
    catalogos:        { table: 'cgp_catalogos',        pk: 'id',  auto: true },
    auditoria:        { table: 'cgp_auditoria',        pk: 'id',  auto: true },
    ausencias:        { table: 'cgp_ausencias',        pk: 'id',  auto: true },
    organigrama:      { table: 'cgp_organigrama',      pk: 'id',  auto: true },
    config:           { table: 'cgp_config',           pk: 'key', auto: false, valueCol: 'value' },
  };

  const cols = (s) => (s.valueCol ? `${s.pk}, ${s.valueCol}` : `${s.pk}, doc`);

  // fila de la BD -> objeto de la app
  function mapOut(s, row) {
    if (!row) return undefined;
    if (s.valueCol) return { [s.pk]: row[s.pk], value: row[s.valueCol] };
    return Object.assign({}, row.doc || {}, { [s.pk]: row[s.pk] });
  }
  // objeto de la app -> fila para insertar/upsertar
  function mapIn(s, value, includePk) {
    if (s.valueCol) return { [s.pk]: value[s.pk], [s.valueCol]: value.value != null ? value.value : null };
    const doc = Object.assign({}, value); delete doc[s.pk];
    const row = { doc };
    if (includePk && value[s.pk] != null) row[s.pk] = value[s.pk];
    if (!s.auto && value[s.pk] != null) row[s.pk] = value[s.pk]; // fotos: id explícito
    return row;
  }
  function fail(error) { throw new Error(error.message || 'Error de base de datos'); }

  function open() { return Promise.resolve(true); } // el cliente ya está listo

  async function getAll(store) {
    const s = STORES[store];
    const { data, error } = await SB().from(s.table).select(cols(s));
    if (error) fail(error);
    return (data || []).map((r) => mapOut(s, r));
  }

  async function get(store, key) {
    const s = STORES[store];
    const { data, error } = await SB().from(s.table).select(cols(s)).eq(s.pk, key).maybeSingle();
    if (error) fail(error);
    return data ? mapOut(s, data) : undefined;
  }

  async function add(store, value) {
    const s = STORES[store];
    const row = mapIn(s, value, false);
    const { data, error } = await SB().from(s.table).insert(row).select(s.pk).single();
    if (error) fail(error);
    return data[s.pk];
  }

  async function put(store, value) {
    const s = STORES[store];
    const row = mapIn(s, value, true);
    const { data, error } = await SB().from(s.table).upsert(row).select(s.pk).single();
    if (error) fail(error);
    return data[s.pk];
  }

  async function del(store, key) {
    const s = STORES[store];
    const { error } = await SB().from(s.table).delete().eq(s.pk, key);
    if (error) fail(error);
  }

  async function clear(store) {
    const s = STORES[store];
    const { error } = await SB().from(s.table).delete().not(s.pk, 'is', null);
    if (error) fail(error);
  }

  async function byIndex(store, indexName, value) {
    // Filtro en cliente sobre el campo del doc (conjuntos pequeños).
    const all = await getAll(store);
    return all.filter((o) => String(o[indexName]) === String(value));
  }

  async function bulkPut(store, values) {
    if (!values || !values.length) return [];
    const s = STORES[store];
    const rows = values.map((v) => mapIn(s, v, true));
    const { data, error } = await SB().from(s.table).upsert(rows).select(s.pk);
    if (error) fail(error);
    return (data || []).map((d) => d[s.pk]);
  }

  async function clearAll() {
    for (const k of Object.keys(STORES)) { await clear(k); }
  }

  return { open, get, getAll, put, add, del, clear, byIndex, bulkPut, clearAll, STORES, DB_NAME: 'cgp_supabase' };
})();
