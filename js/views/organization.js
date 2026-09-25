/* ============================================================================
 * views/organization.js — Organigrama dinámico (estilo estructura CyC)
 * Erwin arriba → departamentos en fila (colapsables) → colaboradores por país.
 * Se construye desde Colaboradores (jefe directo + área + país). Dinámico.
 * ==========================================================================*/
App.UI.route('organizacion', async function (main) {
  const R = App.Repos, U = App.UI;
  const emps = (await R.employeeRepository.all()).filter((e) => (e.estado || 'ACTIVO') === 'ACTIVO');

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const clean = (v) => (v && String(v).trim() && String(v).trim() !== '0') ? String(v).trim() : '';
  const porNombre = new Map(emps.map((e) => [norm(e.nombreCompleto), e]));

  // Bandera por país
  const BANDERA = {
    'guatemala': '🇬🇹', 'el salvador': '🇸🇻', 'república dominicana': '🇩🇴', 'republica dominicana': '🇩🇴',
    'perú': '🇵🇪', 'peru': '🇵🇪', 'honduras': '🇭🇳', 'nicaragua': '🇳🇮', 'panamá': '🇵🇦', 'panama': '🇵🇦',
  };
  const paisValido = (p) => Object.keys(BANDERA).includes(norm(p));

  // Área (real; si vacía hereda del jefe)
  const areaDe = (e) => {
    const a = clean(e.areaFinalReal);
    if (a) return a;
    const j = porNombre.get(norm(e.jefeNombre));
    return j ? clean(j.areaFinalReal) : 'Sin área';
  };
  // País: si reporta a Oliver o Daniel → Guatemala (regla de negocio)
  const OLIVER = 'oliver arturo santos reyes', DANIEL = 'daniel michael enrique monge lopez';
  const paisDe = (e) => {
    const jefe = norm(e.jefeNombre);
    if (jefe === OLIVER || jefe === DANIEL) return 'Guatemala';
    const p = clean(e.pais);
    return paisValido(p) ? p : 'Guatemala';
  };

  // Raíz: líder de Créditos y Cobros
  const raiz = emps.find((e) => norm(e.areaFinalReal) === 'créditos y cobros' && clean(e.titulo).toLowerCase().includes('líder'))
            || emps.find((e) => e.rol === 'Liderazgo' && !porNombre.get(norm(e.jefeNombre)))
            || emps[0];

  // Departamentos: por área, con su líder (quien reporta directo a la raíz o es líder del área)
  const deptos = new Map();
  emps.forEach((e) => {
    if (e.id === (raiz && raiz.id)) return;
    const area = areaDe(e);
    if (norm(area) === 'créditos y cobros') return; // Ayra y similares van a su depto real
    if (!deptos.has(area)) deptos.set(area, { area, lider: null, gente: [] });
    deptos.get(area).gente.push(e);
  });
  // Determinar líder de cada depto: el que reporta a la raíz, o el de mayor jerarquía
  deptos.forEach((d) => {
    d.lider = d.gente.find((e) => norm(e.jefeNombre) === norm(raiz && raiz.nombreCompleto) || norm(e.ultimoLiderNombre) === norm(raiz && raiz.nombreCompleto))
           || d.gente.find((e) => /líder|coordinador|encargado/i.test(clean(e.titulo)))
           || d.gente[0];
  });

  // Orden de departamentos (como la referencia)
  const ordenDept = ['Cobros Moderno', 'Cobros KAM', 'Cobros GLT', 'Cobros Distribuidores', 'Cobros Venta Directa', 'Operaciones de Cartera', 'Créditos', 'Liquidaciones'];
  const listaDept = [...deptos.values()].sort((a, b) => {
    const ia = ordenDept.findIndex((x) => norm(x) === norm(a.area)), ib = ordenDept.findIndex((x) => norm(x) === norm(b.area));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Estado: qué deptos están desplegados
  const abiertos = new Set();

  main.innerHTML = `<div class="page-head"><div><h1>Organigrama</h1><p class="muted">Se actualiza automáticamente con Colaboradores</p></div>
      <div><button class="btn btn--ghost btn--sm" id="orgAll">Desplegar todo</button></div></div>
    <div class="org2-wrap"><div class="org2-scroll" id="org2"></div></div>`;

  async function avatar(e, size) { return await U.avatarHTML(e, size); }

  async function pintar() {
    const cont = document.getElementById('org2');
    // Cabeza
    let html = `<div class="org2-head">
      <div class="org2-lider" data-emp="${raiz.id}">${await avatar(raiz, 46)}
        <div><div class="org2-lider__n">${U.esc(raiz.nombreCompleto)}</div>
        <div class="org2-lider__s">Líder de Créditos y Cobros</div></div>
      </div>
    </div><div class="org2-line"></div>`;

    // Fila de departamentos
    html += `<div class="org2-cols">`;
    for (const d of listaDept) {
      const open = abiertos.has(d.area);
      const gente = d.gente.filter((e) => e.id !== (d.lider && d.lider.id));
      // Agrupar por país
      const porPais = new Map();
      gente.forEach((e) => { const p = paisDe(e); if (!porPais.has(p)) porPais.set(p, []); porPais.get(p).push(e); });
      const paisesOrden = ['Guatemala', 'El Salvador', 'Honduras', 'Nicaragua', 'Panamá', 'Perú', 'República Dominicana'];
      const paisesList = [...porPais.keys()].sort((a, b) => {
        const ia = paisesOrden.findIndex((x) => norm(x) === norm(a)), ib = paisesOrden.findIndex((x) => norm(x) === norm(b));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      html += `<div class="org2-col">
        <button class="org2-dept ${open ? 'is-open' : ''}" data-dept="${U.esc(d.area)}">
          <div class="org2-dept__top">
            <span class="org2-dept__name">${U.esc(d.area)}</span>
            <i class="ti ti-chevron-${open ? 'up' : 'down'}"></i>
          </div>
          <span class="org2-dept__lead">${d.lider ? U.esc(d.lider.nombreCompleto) : '—'}</span>
          <span class="org2-dept__count">${gente.length} colaborador${gente.length === 1 ? '' : 'es'}</span>
        </button>`;

      if (open) {
        html += `<div class="org2-people">`;
        for (const pais of paisesList) {
          html += `<div class="org2-pais"><div class="org2-pais__h">${BANDERA[norm(pais)] || '🏳️'} ${U.esc(pais)}</div>`;
          for (const e of porPais.get(pais).sort((a, b) => U.esc(a.nombreCompleto).localeCompare(b.nombreCompleto))) {
            html += `<div class="org2-person" data-emp="${e.id}">${await avatar(e, 26)}<span>${U.esc(e.nombreCompleto)}</span></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;

    cont.innerHTML = html;

    cont.querySelectorAll('[data-dept]').forEach((b) => b.onclick = () => {
      const a = b.dataset.dept;
      abiertos.has(a) ? abiertos.delete(a) : abiertos.add(a);
      pintar();
    });
    cont.querySelectorAll('[data-emp]').forEach((c) => c.onclick = (ev) => { ev.stopPropagation(); App.UI.navigate('empleados', { id: c.dataset.emp }); });
  }

  document.getElementById('orgAll').onclick = () => {
    if (abiertos.size === listaDept.length) abiertos.clear();
    else listaDept.forEach((d) => abiertos.add(d.area));
    pintar();
  };

  await pintar();
});
