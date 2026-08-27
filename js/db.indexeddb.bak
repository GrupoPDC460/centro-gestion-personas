/* ============================================================================
 * db.js — Capa de acceso a IndexedDB (Centro de Gestión de Personas)
 * Encapsula la base local. Ninguna vista habla con IndexedDB directamente:
 * lo hacen los repositorios (repositories.js) sobre esta capa.
 *
 * IMPORTANTE (persistencia): cada operación crea su transacción y emite la(s)
 * petición(es) de forma SÍNCRONA dentro de ella, y resuelve en `oncomplete`.
 * No se usa `await` entre crear la transacción y emitir la petición, porque en
 * navegadores reales eso auto-cierra la transacción y las escrituras se pierden.
 * ==========================================================================*/
window.App = window.App || {};

App.DB = (function () {
  const DB_NAME = 'cgp_grupopdc';
  const DB_VERSION = 1;

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
    fotos:          { keyPath: 'id', autoIncrement: false, indexes: [] },
    movimientos:    { keyPath: 'id', autoIncrement: true, indexes: [
      ['colaboradorId', 'colaboradorId', {}], ['tipo', 'tipo', {}], ['fecha', 'fecha', {}],
    ]},
    departamentos:  { keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    puestos:        { keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    tiposColaborador:{ keyPath: 'id', autoIncrement: true, indexes: [['nombre', 'nombre', { unique: false }]] },
    catalogos:      { keyPath: 'id', autoIncrement: true, indexes: [['tipo', 'tipo', {}]] },
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
      req.onsuccess = (e) => {
        _db = e.target.result;
        // Si otra pestaña pide subir versión, cerramos para no bloquear.
        _db.onversionchange = () => { try { _db.close(); } catch (_) {} _db = null; };
        resolve(_db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Ejecuta `worker(stores, done)` de forma SÍNCRONA dentro de una transacción.
  // worker debe emitir sus peticiones sin await; usa done(valor) para el resultado.
  function run(storeNames, mode, worker) {
    return open().then((db) => new Promise((resolve, reject) => {
      let result;
      const t = db.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames)
        ? Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]))
        : t.objectStore(storeNames);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transacción abortada'));
      try {
        worker(stores, (v) => { result = v; });
      } catch (err) { reject(err); try { t.abort(); } catch (_) {} }
    }));
  }

  // ---- CRUD genérico ----
  function put(store, value)  { return run(store, 'readwrite', (os, done) => { const r = os.put(value); r.onsuccess = () => done(r.result); }); }
  function add(store, value)  { return run(store, 'readwrite', (os, done) => { const r = os.add(value); r.onsuccess = () => done(r.result); }); }
  function get(store, key)    { return run(store, 'readonly',  (os, done) => { const r = os.get(key); r.onsuccess = () => done(r.result); }); }
  function getAll(store)      { return run(store, 'readonly',  (os, done) => { const r = os.getAll(); r.onsuccess = () => done(r.result); }); }
  function del(store, key)    { return run(store, 'readwrite', (os) => { os.delete(key); }); }
  function clear(store)       { return run(store, 'readwrite', (os) => { os.clear(); }); }
  function byIndex(store, indexName, value) {
    return run(store, 'readonly', (os, done) => { const r = os.index(indexName).getAll(value); r.onsuccess = () => done(r.result); });
  }

  // Inserta muchos registros en UNA sola transacción (importación / restauración).
  function bulkPut(store, values) {
    return run(store, 'readwrite', (os, done) => {
      const ids = [];
      values.forEach((v) => { const r = os.put(v); r.onsuccess = () => ids.push(r.result); });
      done(ids);
    });
  }

  // Vacía todos los stores en una sola transacción atómica.
  function clearAll() {
    return run(Object.keys(STORES), 'readwrite', (stores) => {
      Object.values(stores).forEach((os) => os.clear());
    });
  }

  return { open, put, add, get, getAll, del, clear, byIndex, bulkPut, clearAll, STORES, DB_NAME };
})();
