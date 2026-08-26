/* ============================================================================
 * db.js — Capa de acceso a IndexedDB (Centro de Gestión de Personas)
 * Encapsula la base local. Ninguna vista habla con IndexedDB directamente:
 * lo hacen los repositorios (repositories.js) sobre esta capa.
 * ==========================================================================*/
window.App = window.App || {};

App.DB = (function () {
  const DB_NAME = 'cgp_grupopdc';
  const DB_VERSION = 1;

  // Definición declarativa de object stores e índices.
  const STORES = {
    colaboradores: {
      keyPath: 'id', autoIncrement: true,
      indexes: [
        ['codigo', 'codigo', { unique: false }],
        ['codigoJDE', 'codigoJDE', { unique: false }],
        ['estado', 'estado', { unique: false }],
        ['departamentoId', 'departamentoId', { unique: false }],
        ['puestoId', 'puestoId', { unique: false }],
        ['pais', 'pais', { unique: false }],
      ],
    },
    fotos:          { keyPath: 'id', autoIncrement: false, indexes: [] }, // id = id colaborador
    movimientos:    { keyPath: 'id', autoIncrement: true, indexes: [
      ['colaboradorId', 'colaboradorId', {}], ['tipo', 'tipo', {}], ['fecha', 'fecha', {}],
    ]},
    departamentos:  { keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    puestos:        { keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    tiposColaborador:{ keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    catalogos:      { keyPath: 'id', autoIncrement: true, indexes: [['tipo', 'tipo', {}]] }, // motivoBaja, ubicacion, pais, estado, movimiento
    auditoria:      { keyPath: 'id', autoIncrement: true, indexes: [['fecha', 'fecha', {}], ['colaboradorId', 'colaboradorId', {}]] },
    config:         { keyPath: 'key', autoIncrement: false, indexes: [] },
  };

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: def.autoIncrement });
            (def.indexes || []).forEach(([idxName, keyPath, opts]) => store.createIndex(idxName, keyPath, opts || {}));
          }
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeNames, mode) {
    return open().then((db) => {
      const t = db.transaction(storeNames, mode);
      return t;
    });
  }

  function _wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- CRUD genérico ----
  async function put(store, value) {
    const t = await tx(store, 'readwrite');
    const res = await _wrap(t.objectStore(store).put(value));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
    });
  }

  async function add(store, value) {
    const t = await tx(store, 'readwrite');
    const res = await _wrap(t.objectStore(store).add(value));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
    });
  }

  async function get(store, key) {
    const t = await tx(store, 'readonly');
    return _wrap(t.objectStore(store).get(key));
  }

  async function getAll(store) {
    const t = await tx(store, 'readonly');
    return _wrap(t.objectStore(store).getAll());
  }

  async function del(store, key) {
    const t = await tx(store, 'readwrite');
    await _wrap(t.objectStore(store).delete(key));
    return new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); });
  }

  async function clear(store) {
    const t = await tx(store, 'readwrite');
    await _wrap(t.objectStore(store).clear());
    return new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); });
  }

  async function byIndex(store, indexName, value) {
    const t = await tx(store, 'readonly');
    const idx = t.objectStore(store).index(indexName);
    return _wrap(idx.getAll(value));
  }

  // Inserta muchos registros en una sola transacción (para importación/restore).
  async function bulkPut(store, values) {
    const t = await tx(store, 'readwrite');
    const os = t.objectStore(store);
    const ids = [];
    for (const v of values) {
      ids.push(await _wrap(os.put(v)));
    }
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(ids);
      t.onerror = () => reject(t.error);
    });
  }

  async function clearAll() {
    for (const name of Object.keys(STORES)) { await clear(name); }
  }

  return { open, put, add, get, getAll, del, clear, byIndex, bulkPut, clearAll, STORES, DB_NAME };
})();
