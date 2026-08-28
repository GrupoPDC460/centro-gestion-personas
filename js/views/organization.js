/* ============================================================================
 * views/organization.js — Organigrama tipo lienzo (estilo Visio)
 * - Cajas que se arrastran libremente sobre un lienzo con paneo y zoom.
 * - Conectores curvos entre jefe y dependientes.
 * - Panel lateral retráctil (liquid glass) para crear/editar cajas y asignar
 *   dependencias, tomando personas reales o cajas libres (áreas/puestos).
 * - Todo se guarda en la nube (tabla cgp_organigrama).
 * ==========================================================================*/
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;

  const emps = await R.employeeRepository.all();
  const puestos = await R.positionRepository.all();
  const puestoNombre = (e) => (puestos.find((p) => p.id === e.puestoId) || {}).nombre || '';
  const porId = new Map(emps.map((e) => [e.id, e]));

  // ---- Estado del diagrama ----
  const cfg = (await R.orgChartRepository.load()) || {};
  // Tolerancia a diagramas guardados por versiones anteriores (nombre/parent/puesto).
  const normalizar = (n) => ({
    id: n.id || uidSeguro(),
    empId: n.empId != null ? n.empId : null,
    titulo: n.titulo || n.nombre || '',
    subtitulo: n.subtitulo || n.puesto || '',
    padre: n.padre || n.parent || null,
    color: ['navy', 'celeste', 'naranja', 'dorado', 'verde', 'gris'].includes(n.color) ? n.color : 'celeste',
    x: Number(n.x) || 0, y: Number(n.y) || 0,
  });
  function uidSeguro() { return 'n' + Math.random().toString(36).slice(2, 9); }
  let nodos = Array.isArray(cfg.nodos) ? cfg.nodos.map(normalizar) : [];
  const view = Object.assign({ x: 40, y: 30, k: 1 }, cfg.view || {});
  let seleccion = null, panelAbierto = true, guardando = null;
  let verInactivos = cfg.verInactivos !== false;   // filtro activos/inactivos
  let pantallaCompleta = false;

  const COLORES = [
    ['navy', 'var(--navy)'], ['celeste', 'var(--celeste)'], ['naranja', 'var(--orange)'],
    ['dorado', 'var(--gold)'], ['verde', 'var(--green)'], ['gris', 'var(--slate)'],
  ];
  const W = 190, H = 78;                      // tamaño de caja
  // Rejilla magnética: al mover, las cajas se alinean solas a estos pasos, de
  // modo que el diagrama siempre queda cuadriculado.
  const GRID_X = 220, GRID_Y = 96;
  const imanX = (v) => Math.round(v / GRID_X) * GRID_X;
  const imanY = (v) => Math.round(v / GRID_Y) * GRID_Y;
  const uid = () => 'n' + Math.random().toString(36).slice(2, 9);

  // Si un nodo quedó sin título pero está ligado a una persona, se recupera de ella.
  nodos.forEach((n) => {
    if (n.empId && porId.has(n.empId)) {
      const e = porId.get(n.empId);
      if (!n.titulo) n.titulo = e.nombreCompleto || '';
      if (!n.subtitulo) n.subtitulo = puestoNombre(e);
    }
  });

  // Primera vez: generar el diagrama desde la jefatura conocida.
  let recienGenerado = false;
  if (!nodos.length) { nodos = autoGenerar(); recienGenerado = true; }
  else {
    // Incorporar colaboradores activos que aún no tienen caja (altas posteriores).
    const yaEnDiagrama = new Set(nodos.filter((n) => n.empId).map((n) => n.empId));
    const faltantes = emps.filter((e) => !yaEnDiagrama.has(e.id));
    if (faltantes.length) {
      let fy = Math.max(0, ...nodos.map((n) => n.y)) + 130;
      faltantes.forEach((e, i) => {
        nodos.push({ id: uid(), empId: e.id, titulo: e.nombreCompleto, subtitulo: puestoNombre(e), color: 'gris', padre: null, x: i * 230, y: fy });
      });
      recienGenerado = true;
    }
  }

  function autoGenerar() {
    const activos = emps.slice(); // incluye inactivos: la estructura los contempla
    const porCodigo = new Map(activos.map((e) => [String(e.codigo), e]));
    const jefeDe = (e) => {
      if (e.jefeCodigo && porCodigo.has(String(e.jefeCodigo)) && String(e.jefeCodigo) !== String(e.codigo)) return String(e.jefeCodigo);
      const sup = String(e.supervisorNombre || '').trim().toLowerCase();
      if (sup) { const m = activos.find((x) => String(x.nombreCompleto).trim().toLowerCase() === sup); if (m && m.id !== e.id) return String(m.codigo); }
      return '';
    };
    const idDe = new Map(); const out = [];
    activos.forEach((e) => { const id = uid(); idDe.set(String(e.codigo), id); out.push({ id, empId: e.id, titulo: e.nombreCompleto, subtitulo: puestoNombre(e), color: 'celeste', padre: null, x: 0, y: 0 }); });
    out.forEach((n) => { const e = porId.get(n.empId); const j = jefeDe(e); n.padre = j && idDe.get(j) !== n.id ? idDe.get(j) || null : null; });
    // Color por nivel para que se lea la jerarquía
    const nivel = (n, g = 0) => { const p = out.find((x) => x.id === n.padre); return p && g < 20 ? nivel(p, g + 1) : g; };
    out.forEach((n) => { const l = nivel(n); n.color = l === 0 ? 'navy' : l === 1 ? 'naranja' : l === 2 ? 'celeste' : 'gris'; });
    return autoLayout(out);
  }

  // Acomodo en árbol compacto: las hojas de un mismo jefe se apilan en bloques
  // de varias filas (por defecto 5 por fila) para no crecer a lo ancho.
  function autoLayout(list) {
    const PORFILA = Math.max(2, Number(view.porFila) || 5);
    const hijos = new Map(); const raices = [];
    list.forEach((n) => { if (n.padre && list.some((x) => x.id === n.padre)) { if (!hijos.has(n.padre)) hijos.set(n.padre, []); hijos.get(n.padre).push(n); } else raices.push(n); });
    hijos.forEach((arr) => arr.sort((a, b) => String(a.titulo).localeCompare(String(b.titulo))));
    raices.sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));

    // Espaciados alineados con la rejilla magnética (GRID_X/GRID_Y)
    const GX = GRID_X - W, GY = GRID_Y * 2, GYB = GRID_Y;
    const esHoja = (n) => !(hijos.get(n.id) || []).length;
    const cache = new Map();

    // Ancho que ocupa un nodo con su subárbol
    const ancho = (n, g = 0) => {
      if (cache.has(n.id)) return cache.get(n.id);
      const kids = g > 30 ? [] : (hijos.get(n.id) || []);
      let w;
      if (!kids.length) w = W;
      else {
        const hojas = kids.filter(esHoja), ramas = kids.filter((k) => !esHoja(k));
        // Las hojas se agrupan en bloque de PORFILA columnas
        const colsHojas = hojas.length ? Math.min(PORFILA, hojas.length) : 0;
        const wHojas = colsHojas ? colsHojas * W + (colsHojas - 1) * GX : 0;
        const wRamas = ramas.reduce((s, k, i) => s + ancho(k, g + 1) + (i ? GX : 0), 0);
        w = Math.max(wHojas + (wRamas && wHojas ? GX : 0) + wRamas, W);
      }
      const r = Math.max(W, w);
      cache.set(n.id, r);
      return r;
    };

    const ubicar = (n, izq, depth) => {
      const kids = hijos.get(n.id) || [];
      const w = ancho(n);
      n.y = yDeNivel(depth);
      if (!kids.length) { n.x = Math.round(izq + (w - W) / 2); return; }
      const hojas = kids.filter(esHoja), ramas = kids.filter((k) => !esHoja(k));
      let cursor = izq;
      // 1) Ramas con descendencia, cada una con su ancho
      ramas.forEach((k) => { const kw = ancho(k); ubicar(k, cursor, depth + 1); cursor += kw + GX; });
      // 2) Hojas en bloque de PORFILA por fila (compacto)
      if (hojas.length) {
        const cols = Math.min(PORFILA, hojas.length);
        hojas.forEach((k, i) => {
          const col = i % cols, fila = Math.floor(i / cols);
          k.x = Math.round(cursor + col * (W + GX));
          k.y = yDeNivel(depth + 1) + fila * GYB;
        });
        cursor += cols * W + (cols - 1) * GX;
      }
      // Centrar al padre sobre todo el bloque de sus hijos
      const xs = kids.map((k) => k.x);
      n.x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    };

    // Altura acumulada de cada nivel: considera cuántas filas ocupa el nivel previo.
    const filasPorNivel = {};
    const medir = (n, depth, g = 0) => {
      const kids = g > 30 ? [] : (hijos.get(n.id) || []);
      filasPorNivel[depth] = Math.max(filasPorNivel[depth] || 1, 1);
      const hojas = kids.filter(esHoja);
      if (hojas.length) {
        const cols = Math.min(PORFILA, hojas.length);
        const filas = Math.ceil(hojas.length / cols);
        filasPorNivel[depth + 1] = Math.max(filasPorNivel[depth + 1] || 1, filas);
      }
      kids.filter((k) => !esHoja(k)).forEach((k) => medir(k, depth + 1, g + 1));
    };
    raices.forEach((r) => medir(r, 0));
    const yCache = {};
    function yDeNivel(d) {
      if (yCache[d] != null) return yCache[d];
      let y = 0;
      for (let i = 0; i < d; i++) y += (filasPorNivel[i] > 1 ? (filasPorNivel[i] - 1) * GYB : 0) + GY;
      yCache[d] = y;
      return y;
    }

    let x0 = 0;
    raices.forEach((r) => { ubicar(r, x0, 0); x0 += ancho(r) + GX * 2; });
    // Encajar todo en la rejilla para que quede perfectamente cuadriculado
    list.forEach((n) => { n.x = imanX(n.x); n.y = imanY(n.y); });
    return list;
  }

  // Encuadra todo el diagrama dentro del área visible.
  function ajustar() {
    const canvas = main.querySelector('#canvas');
    if (!canvas || !nodos.length) return;
    const minX = Math.min(...nodos.map((n) => n.x)), maxX = Math.max(...nodos.map((n) => n.x + W));
    const minY = Math.min(...nodos.map((n) => n.y)), maxY = Math.max(...nodos.map((n) => n.y + H));
    const cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 500;
    const pad = 48;
    const k = Math.min(1.2, Math.max(0.28, Math.min((cw - pad * 2) / Math.max(1, maxX - minX), (ch - pad * 2) / Math.max(1, maxY - minY))));
    view.k = Math.round(k * 100) / 100;
    view.x = Math.round((cw - (maxX - minX) * view.k) / 2 - minX * view.k);
    view.y = Math.round((ch - (maxY - minY) * view.k) / 2 - minY * view.k);
  }

  // Pantalla completa: el lienzo ocupa toda la ventana y se encuadra el
  // organigrama entero. Un botón (o Esc) regresa a la vista normal.
  function togglePantallaCompleta() {
    pantallaCompleta = !pantallaCompleta;
    const wrap = main.querySelector('.orgwrap');
    const btn = main.querySelector('#fitBtn');
    if (!wrap) return;
    wrap.classList.toggle('orgwrap--full', pantallaCompleta);
    document.body.classList.toggle('has-orgfull', pantallaCompleta);
    if (btn) btn.textContent = pantallaCompleta ? '⤡ Salir' : '⤢ Pantalla completa';

    // Botón de regreso flotante dentro del lienzo
    let salir = wrap.querySelector('#fullExit');
    if (pantallaCompleta && !salir) {
      salir = document.createElement('button');
      salir.id = 'fullExit'; salir.className = 'orgfull__exit';
      salir.innerHTML = '⤡ Salir de pantalla completa';
      salir.onclick = () => togglePantallaCompleta();
      wrap.appendChild(salir);
    } else if (!pantallaCompleta && salir) salir.remove();

    // Reencuadrar tras la transición de tamaño
    setTimeout(() => { ajustar(); guardar(); pintar(); }, 60);
  }

  // Esc también sale de pantalla completa
  const escHandler = (ev) => { if (ev.key === 'Escape' && pantallaCompleta) togglePantallaCompleta(); };
  document.addEventListener('keydown', escHandler);

  const guardar = () => {
    clearTimeout(guardando);
    guardando = setTimeout(() => R.orgChartRepository.save({ nodos, view, v2: true }).catch(() => {}), 400);
  };

  // ---------------- Render ----------------
  function marco() {
    main.innerHTML = `
      <div class="page-head">
        <div><h1>Organización</h1><p class="muted">Organigrama editable · arrastra las cajas para acomodarlas</p></div>
        <div class="row-gap">
          <label class="switch"><input type="checkbox" id="verInact" ${verInactivos ? 'checked' : ''}><span>Mostrar inactivos</span></label>
          <button class="btn btn--ghost btn--sm" id="autoBtn" title="Acomodar en árbol">✧ Auto-acomodar</button>
          <button class="btn btn--ghost btn--sm" id="fitBtn" title="Ver todo el organigrama en pantalla completa">⤢ Pantalla completa</button>
          <button class="btn btn--ghost btn--sm" id="zoomOut">−</button>
          <button class="btn btn--ghost btn--sm" id="zoomIn">+</button>
          <button class="btn btn--primary btn--sm" id="addBtn">+ Nueva caja</button>
        </div>
      </div>
      <div class="orgwrap">
        <div class="orgcanvas" id="canvas">
          <svg class="orglinks" id="links"></svg>
          <div class="orgnodes" id="nodes"></div>
        </div>
        <button class="orgpanel__tab" id="panelTab" title="Panel de edición"><span id="tabIcon">›</span></button>
        <aside class="orgpanel ${panelAbierto ? '' : 'orgpanel--closed'}" id="panel">
          <div class="orgpanel__inner" id="panelBody"></div>
        </aside>
      </div>`;
    wireMarco();
    pintar();
  }

  async function pintar() {
    const nodes = main.querySelector('#nodes');
    const links = main.querySelector('#links');
    if (!nodes) return;
    nodes.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    links.style.transform = nodes.style.transform;

    // Cajas (respetando el filtro de inactivos)
    const visibles = nodos.filter((n) => {
      if (verInactivos) return true;
      const e = n.empId ? porId.get(n.empId) : null;
      return !e || e.estado === 'ACTIVO';
    });
    const idsVisibles = new Set(visibles.map((n) => n.id));
    const html = await Promise.all(visibles.map(async (n) => {
      const e = n.empId ? porId.get(n.empId) : null;
      const av = e ? await U.avatarHTML(e, 38) : `<span class="orgnode__ico">▦</span>`;
      const inactivo = e && e.estado !== 'ACTIVO';
      return `<div class="orgnode ${seleccion === n.id ? 'is-sel' : ''} ${inactivo ? 'is-off' : ''}" data-id="${n.id}"
                   style="left:${n.x}px; top:${n.y}px; width:${W}px">
        <span class="orgnode__bar" style="background:${colorVar(n.color)}"></span>
        <div class="orgnode__body">
          ${av}
          <div class="orgnode__txt">
            <b>${U.esc(n.titulo || 'Sin nombre')}</b>
            <span class="muted">${U.esc(n.subtitulo || '')}</span>
          </div>
        </div>
      </div>`;
    }));
    nodes.innerHTML = html.join('');

    // Conectores: el estilo lo decide el usuario (ortogonal, curva o recta).
    const pos = new Map(visibles.map((n) => [n.id, n]));
    const estilo = view.linea || 'ortogonal';
    let paths = '';
    visibles.forEach((n) => {
      const p = n.padre && pos.get(n.padre); if (!p || !idsVisibles.has(p.id)) return;
      const x1 = p.x + W / 2, y1 = p.y + H, x2 = n.x + W / 2, y2 = n.y;
      const my = y1 + Math.max(22, (y2 - y1) / 2);
      let d;
      if (estilo === 'recta') d = `M${x1},${y1} L${x2},${y2}`;
      else if (estilo === 'curva') d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      else { // ortogonal con esquinas redondeadas (estilo Visio)
        const r = 12, dir = x2 > x1 ? 1 : -1, dx = Math.abs(x2 - x1);
        d = dx < 2
          ? `M${x1},${y1} L${x2},${y2}`
          : `M${x1},${y1} L${x1},${my - r} Q${x1},${my} ${x1 + r * dir},${my} L${x2 - r * dir},${my} Q${x2},${my} ${x2},${my + r} L${x2},${y2}`;
      }
      paths += `<path d="${d}" class="orglink"/>`;
    });
    links.innerHTML = paths;
    const maxX = Math.max(600, ...visibles.map((n) => n.x + W + 100));
    const maxY = Math.max(400, ...visibles.map((n) => n.y + H + 100));
    links.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    links.setAttribute('width', maxX); links.setAttribute('height', maxY);

    wireNodos();
    panelHTML();
  }

  const colorVar = (c) => (COLORES.find((x) => x[0] === c) || COLORES[1])[1];

  // ---------------- Interacción del lienzo ----------------
  function wireMarco() {
    const canvas = main.querySelector('#canvas');

    main.querySelector('#addBtn').onclick = () => nuevaCaja();
    main.querySelector('#autoBtn').onclick = () => { nodos = autoLayout(nodos); ajustar(); guardar(); pintar(); };
    main.querySelector('#fitBtn').onclick = () => togglePantallaCompleta();
    main.querySelector('#verInact').onchange = (ev) => {
      verInactivos = ev.target.checked;
      R.orgChartRepository.save({ nodos, view, v2: true, verInactivos }).catch(() => {});
      pintar();
    };
    main.querySelector('#zoomIn').onclick = () => { view.k = Math.min(1.6, view.k + 0.1); guardar(); pintar(); };
    main.querySelector('#zoomOut').onclick = () => { view.k = Math.max(0.4, view.k - 0.1); guardar(); pintar(); };
    main.querySelector('#panelTab').onclick = () => {
      panelAbierto = !panelAbierto;
      main.querySelector('#panel').classList.toggle('orgpanel--closed', !panelAbierto);
      main.querySelector('#tabIcon').textContent = panelAbierto ? '›' : '‹';
    };
    main.querySelector('#tabIcon').textContent = panelAbierto ? '›' : '‹';

    // Paneo del lienzo (arrastrar el fondo)
    let pan = false, px = 0, py = 0;
    canvas.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.orgnode')) return;
      pan = true; px = ev.clientX; py = ev.clientY; canvas.classList.add('is-pan');
      seleccion = null; pintar();
    });
    window.addEventListener('mousemove', (ev) => {
      if (!pan) return;
      view.x += ev.clientX - px; view.y += ev.clientY - py; px = ev.clientX; py = ev.clientY;
      const n = main.querySelector('#nodes'), l = main.querySelector('#links');
      if (n) { n.style.transform = l.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; }
    });
    window.addEventListener('mouseup', () => { if (pan) { pan = false; canvas.classList.remove('is-pan'); guardar(); } });
  }

  function wireNodos() {
    main.querySelectorAll('.orgnode').forEach((el) => {
      const n = nodos.find((x) => x.id === el.dataset.id);
      let drag = false, sx = 0, sy = 0, ox = 0, oy = 0, movido = false;

      el.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        drag = true; movido = false; sx = ev.clientX; sy = ev.clientY; ox = n.x; oy = n.y;
        el.classList.add('is-drag');
      });
      const mover = (ev) => {
        if (!drag) return;
        const dx = (ev.clientX - sx) / view.k, dy = (ev.clientY - sy) / view.k;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movido = true;
        // Alineación automática a la rejilla (se puede desactivar con Alt)
        const libre = ev.altKey;
        n.x = libre ? Math.round(ox + dx) : imanX(ox + dx);
        n.y = libre ? Math.round(oy + dy) : imanY(oy + dy);
        el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
      };
      const soltar = () => {
        if (!drag) return;
        drag = false; el.classList.remove('is-drag');
        if (movido) { guardar(); pintar(); }
        else { seleccion = n.id; pintar(); }
      };
      window.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', soltar);
      el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); const e = n.empId && porId.get(n.empId); if (e) App.UI.navigate('empleados', { id: e.id }); });
    });
  }

  // ---------------- Panel lateral (liquid glass) ----------------
  function panelHTML() {
    const body = main.querySelector('#panelBody'); if (!body) return;
    const n = nodos.find((x) => x.id === seleccion);
    const opcionesPadre = nodos.filter((x) => x.id !== (n && n.id))
      .map((x) => `<option value="${x.id}" ${n && n.padre === x.id ? 'selected' : ''}>${U.esc(x.titulo)}</option>`).join('');

    if (!n) {
      body.innerHTML = `
        <h3 class="orgpanel__t">Organigrama</h3>
        <p class="muted">Selecciona una caja para editarla, o crea una nueva.</p>
        <button class="btn btn--primary" id="pNueva" style="width:100%;justify-content:center;margin-top:12px">+ Nueva caja</button>
        <label class="f" style="margin-top:14px"><span>Líneas de mando</span>
          <select class="input" id="pLinea">
            <option value="ortogonal" ${(view.linea || 'ortogonal') === 'ortogonal' ? 'selected' : ''}>En escuadra (Visio)</option>
            <option value="curva" ${view.linea === 'curva' ? 'selected' : ''}>Curvas</option>
            <option value="recta" ${view.linea === 'recta' ? 'selected' : ''}>Rectas</option>
          </select></label>
        <label class="f" style="margin-top:10px"><span>Personas por fila (compactar)</span>
          <select class="input" id="pFila">
            ${[3, 4, 5, 6, 8].map((n) => `<option value="${n}" ${(Number(view.porFila) || 5) === n ? 'selected' : ''}>${n} por fila</option>`).join('')}
          </select></label>
        <div class="orgpanel__stats">
          <div><b>${nodos.length}</b><span class="muted">Cajas</span></div>
          <div><b>${nodos.filter((x) => !x.padre).length}</b><span class="muted">Nivel superior</span></div>
        </div>
        <p class="muted" style="margin-top:14px">Arrastra el fondo para desplazarte · doble clic en una caja abre la ficha.</p>`;
      const b = body.querySelector('#pNueva'); if (b) b.onclick = () => nuevaCaja();
      const sl = body.querySelector('#pLinea');
      if (sl) sl.onchange = (ev) => { view.linea = ev.target.value; guardar(); pintar(); };
      const sf = body.querySelector('#pFila');
      if (sf) sf.onchange = (ev) => { view.porFila = +ev.target.value; nodos = autoLayout(nodos); ajustar(); guardar(); pintar(); };
      return;
    }

    body.innerHTML = `
      <h3 class="orgpanel__t">Editar caja</h3>
      <label class="f"><span>Persona (opcional)</span>
        <select class="input" id="pEmp">
          <option value="">— Caja libre (área o puesto) —</option>
          ${emps.map((e) => `<option value="${e.id}" ${n.empId === e.id ? 'selected' : ''}>${U.esc(e.nombreCompleto)}</option>`).join('')}
        </select></label>
      <label class="f"><span>Título</span><input class="input" id="pTit" value="${U.esc(n.titulo || '')}"></label>
      <label class="f"><span>Subtítulo / puesto</span><input class="input" id="pSub" value="${U.esc(n.subtitulo || '')}"></label>
      <label class="f"><span>Depende de</span>
        <select class="input" id="pPadre"><option value="">— Nivel superior —</option>${opcionesPadre}</select></label>
      <div class="f"><span>Color</span>
        <div class="swatches">${COLORES.map((c) => `<button class="sw ${n.color === c[0] ? 'is-on' : ''}" data-c="${c[0]}" style="background:${c[1]}" title="${c[0]}"></button>`).join('')}</div>
      </div>
      <div class="row-gap" style="margin-top:14px">
        <button class="btn btn--ghost btn--sm" id="pDup">Duplicar</button>
        <button class="btn btn--danger btn--sm" id="pDel">Eliminar</button>
      </div>`;

    body.querySelector('#pEmp').onchange = (ev) => {
      const id = +ev.target.value || null;
      n.empId = id;
      if (id) { const e = porId.get(id); n.titulo = e.nombreCompleto; n.subtitulo = puestoNombre(e); }
      guardar(); pintar();
    };
    body.querySelector('#pTit').oninput = (ev) => { n.titulo = ev.target.value; guardar(); pintarSoloCaja(n); };
    body.querySelector('#pSub').oninput = (ev) => { n.subtitulo = ev.target.value; guardar(); pintarSoloCaja(n); };
    body.querySelector('#pPadre').onchange = (ev) => {
      const nuevo = ev.target.value || null;
      if (nuevo && crearíaCiclo(n.id, nuevo)) { U.toast('Esa dependencia crearía un ciclo', 'warn'); pintar(); return; }
      n.padre = nuevo; guardar(); pintar();
    };
    body.querySelectorAll('.sw').forEach((b) => b.onclick = () => { n.color = b.dataset.c; guardar(); pintar(); });
    body.querySelector('#pDup').onclick = () => {
      const copia = Object.assign({}, n, { id: uid(), x: n.x + 30, y: n.y + 30, empId: null });
      nodos.push(copia); seleccion = copia.id; guardar(); pintar();
    };
    body.querySelector('#pDel').onclick = async () => {
      if (!(await U.confirm(`¿Eliminar la caja <b>${U.esc(n.titulo)}</b> del organigrama? Sus dependientes suben un nivel. Esto no borra a la persona.`, { danger: true, ok: 'Eliminar' }))) return;
      nodos.filter((x) => x.padre === n.id).forEach((x) => { x.padre = n.padre; });
      nodos = nodos.filter((x) => x.id !== n.id);
      seleccion = null; guardar(); pintar();
    };
  }

  function pintarSoloCaja(n) {
    const el = main.querySelector(`.orgnode[data-id="${n.id}"] .orgnode__txt`);
    if (el) el.innerHTML = `<b>${U.esc(n.titulo || 'Sin nombre')}</b><span class="muted">${U.esc(n.subtitulo || '')}</span>`;
  }

  function crearíaCiclo(idHijo, idPadre) {
    let cur = idPadre, guard = 0;
    while (cur && guard++ < 100) {
      if (cur === idHijo) return true;
      const p = nodos.find((x) => x.id === cur);
      cur = p ? p.padre : null;
    }
    return false;
  }

  function nuevaCaja() {
    const n = { id: uid(), empId: null, titulo: 'Nueva caja', subtitulo: '', color: 'celeste', padre: seleccion || null,
      x: Math.round(-view.x / view.k + 120), y: Math.round(-view.y / view.k + 120) };
    nodos.push(n); seleccion = n.id; panelAbierto = true;
    const p = main.querySelector('#panel'); if (p) p.classList.remove('orgpanel--closed');
    guardar(); pintar();
  }

  marco();
  if (recienGenerado) { nodos = autoLayout(nodos); ajustar(); guardar(); pintar(); }
  else if (!cfg.v2) {
    // Diagrama de una versión anterior: reacomodar con el layout compacto una vez.
    nodos = autoLayout(nodos); ajustar();
    R.orgChartRepository.save({ nodos, view, v2: true }).catch(() => {});
    pintar();
  }
});

/* views/emergency.js — Árbol de emergencia */
App.UI.route('emergencia', async function (main) {
  const R = App.Repos, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => e.estado === 'ACTIVO');
  const conContacto = emps.filter((e) => e.emergencia && e.emergencia.nombre);
  const sinContacto = emps.filter((e) => !(e.emergencia && e.emergencia.nombre));
  const card = async (e) => `<div class="card emg">
    <div class="emg__head">${await U.avatarHTML(e, 40)}<div><b>${U.esc(e.nombreCompleto)}</b><span class="muted">${U.esc(e.celular || '')}</span></div></div>
    <div class="emg__body">
      <div class="fld"><span class="fld__l">Contacto</span><span class="fld__v">${U.esc(e.emergencia.nombre || '—')}</span></div>
      <div class="fld"><span class="fld__l">Parentesco</span><span class="fld__v">${U.esc(e.emergencia.parentesco || '—')}</span></div>
      <div class="fld"><span class="fld__l">Teléfono</span><span class="fld__v">${e.emergencia.telefono ? `<a href="tel:${U.esc(e.emergencia.telefono)}">${U.esc(e.emergencia.telefono)}</a>` : '—'}</span></div>
    </div></div>`;
  main.innerHTML = `<div class="page-head"><h1>Árbol de Emergencia</h1>
      <input id="be" class="input input--search" placeholder="Buscar colaborador…"></div>
    ${sinContacto.length ? `<div class="banner banner--warn">⚠ ${sinContacto.length} colaborador(es) sin contacto de emergencia registrado.</div>` : ''}
    <div id="emgGrid" class="cols cols--3">${(await Promise.all(conContacto.map(card))).join('')}</div>`;
  document.getElementById('be').oninput = (ev) => {
    const q = ev.target.value.toLowerCase();
    main.querySelectorAll('#emgGrid .emg').forEach((c) => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  };
});

/* views/reports.js — Reportes + exportación CSV/XLSX */
App.UI.route('reportes', async function (main) {
  const R = App.Repos, C = App.Calc, U = App.UI;
  const [emps, deptos, puestos] = await Promise.all([R.employeeRepository.all(), R.departmentRepository.all(), R.positionRepository.all()]);
  const depName = Object.fromEntries(deptos.map((d) => [d.id, d.nombre]));
  const posName = Object.fromEntries(puestos.map((d) => [d.id, d.nombre]));
  const activos = emps.filter((e) => e.estado === 'ACTIVO');

  const group = (arr, f) => { const o = {}; arr.forEach((x) => { const k = f(x) || '—'; o[k] = (o[k] || 0) + 1; }); return o; };
  const tabla = (obj) => `<table class="table"><tbody>${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${U.esc(k)}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join('')}</tbody></table>`;

  const dataExport = () => emps.map((e) => ({
    Codigo: e.codigo, CodigoJDE: e.codigoJDE, Nombre: e.nombreCompleto,
    Departamento: depName[e.departamentoId] || '', Puesto: posName[e.puestoId] || '',
    Tipo: e.tipoColaborador, Genero: e.genero, Pais: e.pais,
    FechaIngreso: e.fechaIngreso, Antiguedad: C.antiguedad(e.fechaIngreso).text,
    Edad: C.edad(e.fechaNacimiento), Estado: e.estado, Celular: e.celular,
    CorreoCorporativo: e.correoCorporativo, ContactoEmergencia: e.emergencia && e.emergencia.nombre,
    TelEmergencia: e.emergencia && e.emergencia.telefono,
  }));

  main.innerHTML = `<div class="page-head"><h1>Reportes</h1>
      <div class="row-gap"><button class="btn btn--ghost" id="csvBtn">Exportar CSV</button><button class="btn btn--primary" id="xlsxBtn">Exportar XLSX</button></div></div>
    <div class="cols cols--3">
      <div class="card"><h3 class="card__title">Headcount por departamento</h3>${tabla(group(activos, (e) => depName[e.departamentoId]))}</div>
      <div class="card"><h3 class="card__title">Por puesto</h3>${tabla(group(activos, (e) => posName[e.puestoId]))}</div>
      <div class="card"><h3 class="card__title">Por país</h3>${tabla(group(activos, (e) => e.pais))}</div>
      <div class="card"><h3 class="card__title">Por género</h3>${tabla(group(activos, (e) => e.genero))}</div>
      <div class="card"><h3 class="card__title">Por antigüedad</h3>${tabla(group(activos, (e) => C.CAT_ANTIGUEDAD[C.antiguedad(e.fechaIngreso).categoria]))}</div>
      <div class="card"><h3 class="card__title">Por estado</h3>${tabla(group(emps, (e) => e.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'))}</div>
    </div>`;

  document.getElementById('csvBtn').onclick = () => {
    const rows = dataExport(); const heads = Object.keys(rows[0] || { vacio: '' });
    const csv = [heads.join(','), ...rows.map((r) => heads.map((h) => `"${String(r[h] == null ? '' : r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
    dl(new Blob(['\ufeff' + csv], { type: 'text/csv' }), 'reporte-colaboradores.csv');
  };
  document.getElementById('xlsxBtn').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dataExport());
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
    XLSX.writeFile(wb, 'reporte-colaboradores.xlsx');
  };
  function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); U.toast('Reporte exportado'); }
});
