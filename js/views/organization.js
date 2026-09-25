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
  // Banderas reales (imágenes de flagcdn.com)
  const ISO = {
    'guatemala': 'gt', 'el salvador': 'sv', 'república dominicana': 'do', 'republica dominicana': 'do',
    'perú': 'pe', 'peru': 'pe', 'honduras': 'hn', 'nicaragua': 'ni', 'panamá': 'pa', 'panama': 'pa',
    'costa rica': 'cr', 'méxico': 'mx', 'mexico': 'mx',
  };
  function BANDERA(pais) {
    const code = ISO[norm(pais)];
    if (!code) return '';
    return `<img class="flagico" src="https://flagcdn.com/32x24/${code}.png" srcset="https://flagcdn.com/64x48/${code}.png 2x" width="20" height="15" alt="${U.esc(pais)}" loading="lazy">`;
  }
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
  const YOSELIN = 'yoselin de los santos garcía';
  const SUPERVISORES_VD = [DANIEL, OLIVER, YOSELIN]; // agrupación especial de Venta Directa
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
  // Líder de cada depto:
  //  1) el miembro que reporta directo a la raíz (Erwin) → dueño real de la caja (ej. Henry, Dennis)
  //  2) si ninguno reporta a la raíz, el jefe más común de los miembros (ej. KAM → Luis Yantuche)
  const nRaiz = norm(raiz && raiz.nombreCompleto);
  deptos.forEach((d) => {
    let lider = d.gente.find((e) => norm(e.jefeNombre) === nRaiz || norm(e.ultimoLiderNombre) === nRaiz);
    if (!lider) {
      const votos = new Map();
      d.gente.forEach((e) => {
        const jefe = porNombre.get(norm(e.jefeNombre));
        if (jefe && jefe.id !== (raiz && raiz.id)) votos.set(jefe.id, (votos.get(jefe.id) || 0) + 1);
      });
      let liderId = null, max = 0;
      votos.forEach((n, id) => { if (n > max) { max = n; liderId = id; } });
      lider = (liderId && emps.find((e) => e.id === liderId))
           || d.gente.find((e) => /líder|coordinador|encargado/i.test(clean(e.titulo)))
           || d.gente[0];
    }
    d.lider = lider;
    d.gente = d.gente.filter((e) => e.id !== (d.lider && d.lider.id));
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
      <div style="display:flex;gap:8px"><button class="btn btn--ghost btn--sm" id="orgFull"><i class="ti ti-maximize"></i> Pantalla completa</button><button class="btn btn--ghost btn--sm" id="orgAll">Desplegar todo</button></div></div>
    <div class="org2-outer" id="orgOuter"><div class="org2-wrap"><div class="org2-scroll" id="org2"></div></div></div>`;

  async function avatar(e, size) { return await U.avatarHTML(e, size); }

  async function pintar() {
    const cont = document.getElementById('org2');
    // Cabeza
    let html = `<div class="org2-head">
      <div class="org2-lider" data-emp="${raiz.id}">${await avatar(raiz, 46)}
        <div><div class="org2-lider__n">${U.esc(raiz.nombreCompleto)}</div>
        <div class="org2-lider__s">${BANDERA(paisDe(raiz))} Líder de Créditos y Cobros</div></div>
      </div>
    </div><div class="org2-line"></div>`;

    // Fila de departamentos
    html += `<div class="org2-cols">`;
    for (const d of listaDept) {
      const open = abiertos.has(d.area);
      const gente = d.gente;
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
          <span class="org2-dept__lead">${d.lider ? BANDERA(paisDe(d.lider)) + ' ' + U.esc(d.lider.nombreCompleto) : '—'}</span>
          <span class="org2-dept__count">${gente.length} colaborador${gente.length === 1 ? '' : 'es'}</span>
        </button>`;

      if (open) {
        html += `<div class="org2-people">`;
        const esVD = /venta directa/i.test(d.area);
        if (esVD) {
          // Agrupar por supervisor: Daniel, Oliver, Yoselin (cada uno con sus colaboradores + país)
          const supervisores = gente.filter((e) => SUPERVISORES_VD.includes(norm(e.nombreCompleto)));
          const otros = gente.filter((e) => !SUPERVISORES_VD.includes(norm(e.nombreCompleto)));
          for (const sup of supervisores.sort((a,b)=>SUPERVISORES_VD.indexOf(norm(a.nombreCompleto))-SUPERVISORES_VD.indexOf(norm(b.nombreCompleto)))) {
            const suyos = otros.filter((e) => norm(e.jefeNombre) === norm(sup.nombreCompleto));
            html += `<div class="org2-sup"><div class="org2-sup__h" data-emp="${sup.id}">${await avatar(sup, 24)}<span>${U.esc(sup.nombreCompleto)}</span>${BANDERA(paisDe(sup))}<em>${U.esc(clean(sup.titulo) || 'Supervisor')}</em></div>`;
            const pmap = new Map();
            suyos.forEach((e) => { const p = paisDe(e); if (!pmap.has(p)) pmap.set(p, []); pmap.get(p).push(e); });
            for (const [pais, arr] of pmap) {
              html += `<div class="org2-pais org2-pais--sub"><div class="org2-pais__h">${BANDERA(pais)} <span>${U.esc(pais)}</span></div>`;
              for (const e of arr.sort((a,b)=>U.esc(a.nombreCompleto).localeCompare(b.nombreCompleto))) {
                html += `<div class="org2-person" data-emp="${e.id}">${await avatar(e, 24)}<span>${U.esc(e.nombreCompleto)}</span></div>`;
              }
              html += `</div>`;
            }
            if (!suyos.length) html += `<div class="org2-pais__empty">Sin colaboradores directos</div>`;
            html += `</div>`;
          }
          // Personas de VD que no cuelgan de ningún supervisor (reportan directo a Henry)
          const sueltos = otros.filter((e) => !supervisores.some((sup) => norm(e.jefeNombre) === norm(sup.nombreCompleto)));
          if (sueltos.length) {
            html += `<div class="org2-sup"><div class="org2-sup__h"><span>Reportan directo al líder</span></div>`;
            for (const e of sueltos.sort((a,b)=>U.esc(a.nombreCompleto).localeCompare(b.nombreCompleto))) {
              html += `<div class="org2-person" data-emp="${e.id}">${await avatar(e, 24)}<span>${U.esc(e.nombreCompleto)} <em class="org2-flag">${BANDERA(paisDe(e))}</em></span></div>`;
            }
            html += `</div>`;
          }
        } else {
          for (const pais of paisesList) {
            html += `<div class="org2-pais"><div class="org2-pais__h">${BANDERA(pais)} <span>${U.esc(pais)}</span></div>`;
            for (const e of porPais.get(pais).sort((a, b) => U.esc(a.nombreCompleto).localeCompare(b.nombreCompleto))) {
              html += `<div class="org2-person" data-emp="${e.id}">${await avatar(e, 26)}<span>${U.esc(e.nombreCompleto)}</span></div>`;
            }
            html += `</div>`;
          }
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

  document.getElementById('orgFull').onclick = () => {
    const outer = document.getElementById('orgOuter');
    document.body.classList.toggle('org-fs');
    const on = document.body.classList.contains('org-fs');
    document.getElementById('orgFull').innerHTML = on ? '<i class="ti ti-minimize"></i> Salir' : '<i class="ti ti-maximize"></i> Pantalla completa';
  };

  document.getElementById('orgAll').onclick = () => {
    if (abiertos.size === listaDept.length) abiertos.clear();
    else listaDept.forEach((d) => abiertos.add(d.area));
    pintar();
  };

  await pintar();
});
