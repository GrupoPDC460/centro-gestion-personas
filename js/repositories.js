/* ============================================================================
 * repositories.js — Capa de repositorios
 * La interfaz NO depende directamente de IndexedDB (spec §52). Mañana, para
 * conectar a API/SQL Server, se reescribe SOLO esta capa.
 * ==========================================================================*/
window.App = window.App || {};

App.Repos = (function () {
  const DB = App.DB;
  const now = () => new Date().toISOString();

  // -------------------- Colaboradores --------------------
  const employeeRepository = {
    all: () => DB.getAll('colaboradores'),
    get: (id) => DB.get('colaboradores', id),
    async byCodigo(codigo) {
      const r = await DB.byIndex('colaboradores', 'codigo', String(codigo));
      return r[0] || null;
    },
    async create(data) {
      data.createdAt = now(); data.updatedAt = now();
      if (data.estado == null) data.estado = 'ACTIVO';
      const id = await DB.add('colaboradores', data);
      return id;
    },
    async update(id, patch) {
      const cur = await DB.get('colaboradores', id);
      if (!cur) throw new Error('Colaborador no encontrado');
      const next = Object.assign({}, cur, patch, { id, updatedAt: now() });
      await DB.put('colaboradores', next);
      return next;
    },
    remove: (id) => DB.del('colaboradores', id), // uso restringido: sólo sin historial
    activos: () => DB.byIndex('colaboradores', 'estado', 'ACTIVO'),
    inactivos: () => DB.byIndex('colaboradores', 'estado', 'INACTIVO'),
  };

  // -------------------- Fotos (blobs / dataURL) --------------------
  const photoRepository = {
    get: (id) => DB.get('fotos', id),
    set: (id, dataUrl) => DB.put('fotos', { id, dataUrl, updatedAt: now() }),
    remove: (id) => DB.del('fotos', id),
    all: () => DB.getAll('fotos'),
  };

  // -------------------- Movimientos --------------------
  const movementRepository = {
    all: () => DB.getAll('movimientos'),
    byColaborador: (id) => DB.byIndex('movimientos', 'colaboradorId', id),
    async add(m) {
      m.fecha = m.fecha || now().slice(0, 10);
      m.createdAt = now();
      return DB.add('movimientos', m);
    },
    remove: (id) => DB.del('movimientos', id),
  };

  // -------------------- Catálogos --------------------
  const departmentRepository = {
    all: () => DB.getAll('departamentos'),
    get: (id) => DB.get('departamentos', id),
    async ensure(nombre) {
      const list = await DB.getAll('departamentos');
      const f = list.find((d) => d.nombre.toLowerCase() === String(nombre).toLowerCase());
      if (f) return f.id;
      return DB.add('departamentos', { nombre, activo: true });
    },
    create: (nombre) => DB.add('departamentos', { nombre, activo: true }),
    update: (id, patch) => DB.get('departamentos', id).then((c) => DB.put('departamentos', Object.assign({}, c, patch, { id }))),
    remove: (id) => DB.del('departamentos', id),
  };

  const positionRepository = {
    all: () => DB.getAll('puestos'),
    get: (id) => DB.get('puestos', id),
    async ensure(nombre) {
      const list = await DB.getAll('puestos');
      const f = list.find((d) => d.nombre.toLowerCase() === String(nombre).toLowerCase());
      if (f) return f.id;
      return DB.add('puestos', { nombre, activo: true });
    },
    create: (nombre) => DB.add('puestos', { nombre, activo: true }),
    update: (id, patch) => DB.get('puestos', id).then((c) => DB.put('puestos', Object.assign({}, c, patch, { id }))),
    remove: (id) => DB.del('puestos', id),
  };

  const typeRepository = {
    all: () => DB.getAll('tiposColaborador'),
    async ensure(nombre) {
      const list = await DB.getAll('tiposColaborador');
      const f = list.find((d) => d.nombre.toLowerCase() === String(nombre).toLowerCase());
      if (f) return f.id;
      return DB.add('tiposColaborador', { nombre, activo: true });
    },
    create: (nombre) => DB.add('tiposColaborador', { nombre, activo: true }),
    remove: (id) => DB.del('tiposColaborador', id),
  };

  // Catálogo genérico (motivoBaja, ubicacion, pais, estado, ...)
  const catalogRepository = {
    all: () => DB.getAll('catalogos'),
    byTipo: (tipo) => DB.byIndex('catalogos', 'tipo', tipo),
    async ensure(tipo, valor) {
      const list = await DB.byIndex('catalogos', 'tipo', tipo);
      const f = list.find((d) => String(d.valor).toLowerCase() === String(valor).toLowerCase());
      if (f) return f.id;
      return DB.add('catalogos', { tipo, valor, activo: true });
    },
    create: (tipo, valor) => DB.add('catalogos', { tipo, valor, activo: true }),
    remove: (id) => DB.del('catalogos', id),
  };

  // -------------------- Auditoría --------------------
  const auditRepository = {
    all: () => DB.getAll('auditoria'),
    add: (accion, colaboradorId, campo, valorAnterior, valorNuevo) =>
      DB.add('auditoria', { fecha: now(), accion, colaboradorId, campo, valorAnterior, valorNuevo }),
  };

  // -------------------- Config / settings --------------------
  const settingsRepository = {
    get: (key) => DB.get('config', key).then((r) => (r ? r.value : undefined)),
    set: (key, value) => DB.put('config', { key, value }),
  };

  // -------------------- Ausencias (vacaciones/permisos/incapacidades) --------------------
  const DIAS_VACACIONES_ANUAL = 15; // ajustable en Configuración
  const absenceRepository = {
    all: () => DB.getAll('ausencias'),
    byColaborador: (id) => DB.byIndex('ausencias', 'colaboradorId', id),
    async add(a) {
      a.createdAt = now();
      a.dias = absenceRepository.diasHabiles(a.desde, a.hasta);
      return DB.add('ausencias', a);
    },
    update: (id, patch) => DB.get('ausencias', id).then((cur) => {
      if (!cur) throw new Error('Ausencia no encontrada');
      const next = Object.assign({}, cur, patch);
      next.dias = absenceRepository.diasHabiles(next.desde, next.hasta);
      return DB.put('ausencias', next);
    }),
    remove: (id) => DB.del('ausencias', id),
    // Días naturales entre dos fechas, inclusivo.
    diasHabiles(desde, hasta) {
      const a = new Date(desde + 'T00:00:00'), b = new Date(hasta + 'T00:00:00');
      if (isNaN(a) || isNaN(b) || b < a) return 0;
      return Math.round((b - a) / 86400000) + 1;
    },
    // Saldo de vacaciones del año en curso.
    async saldoVacaciones(colaboradorId, year) {
      year = year || new Date().getFullYear();
      const list = await absenceRepository.byColaborador(colaboradorId);
      const usados = list
        .filter((a) => a.tipo === 'VACACIONES' && a.estado !== 'RECHAZADA' && String(a.desde).slice(0, 4) === String(year))
        .reduce((s, a) => s + (a.dias || 0), 0);
      const asignados = DIAS_VACACIONES_ANUAL;
      return { asignados, usados, disponibles: Math.max(0, asignados - usados), year };
    },
    // Ausencia vigente hoy (para reflejar la situación actual del colaborador).
    vigenteHoy(list, hoyISO) {
      hoyISO = hoyISO || new Date().toISOString().slice(0, 10);
      return list.find((a) => a.estado !== 'RECHAZADA' && a.desde <= hoyISO && a.hasta >= hoyISO) || null;
    },
    DIAS_VACACIONES_ANUAL,
  };

  // -------------------- Organigrama (posiciones/ajustes manuales) --------------------
  const orgChartRepository = {
    async load() {
      const rows = await DB.getAll('organigrama');
      return rows.length ? rows[0] : null;
    },
    async save(data) {
      const cur = await orgChartRepository.load();
      const rec = Object.assign({}, cur || {}, data, { updatedAt: now() });
      return DB.put('organigrama', rec);
    },
  };

  return {
    employeeRepository, photoRepository, movementRepository,
    departmentRepository, positionRepository, typeRepository,
    catalogRepository, auditRepository, settingsRepository,
    absenceRepository, orgChartRepository,
  };
})();
