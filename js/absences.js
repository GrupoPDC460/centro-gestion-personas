/* ============================================================================
 * absences.js — Vacaciones, permisos e incapacidades por colaborador
 * Registra ausencias con rango de fechas, calcula días y saldo de vacaciones,
 * y refleja la situación vigente del colaborador.
 * ==========================================================================*/
window.App = window.App || {};

App.Absences = (function () {
  const R = () => App.Repos, U = () => App.UI;

  const TIPOS = [
    ['VACACIONES', 'Vacaciones', 'var(--celeste)'],
    ['PERMISO', 'Permiso', 'var(--gold)'],
    ['INCAPACIDAD', 'Incapacidad', 'var(--red)'],
    ['OTRO', 'Otro', 'var(--slate)'],
  ];
  const label = (t) => (TIPOS.find((x) => x[0] === t) || ['', t])[1];
  const color = (t) => (TIPOS.find((x) => x[0] === t) || ['', '', 'var(--slate)'])[2];
  const hoyISO = () => new Date().toISOString().slice(0, 10);

  // Tarjeta para la ficha del colaborador.
  async function cardHTML(emp) {
    const list = (await R().absenceRepository.byColaborador(emp.id))
      .sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
    const saldo = await R().absenceRepository.saldoVacaciones(emp.id);
    const vig = R().absenceRepository.vigenteHoy(list);

    const filas = list.length ? list.map((a) => `
      <div class="aus" data-aus="${a.id}">
        <span class="aus__tag" style="background:color-mix(in srgb, ${color(a.tipo)} 20%, transparent); color:${color(a.tipo)}">${label(a.tipo)}</span>
        <div class="aus__info">
          <b>${U().fechaCorta(a.desde)} → ${U().fechaCorta(a.hasta)}</b>
          <span class="muted">${a.dias} día${a.dias === 1 ? '' : 's'}${a.motivo ? ' · ' + U().esc(a.motivo) : ''}</span>
        </div>
        <button class="mini-x" data-del="${a.id}" title="Eliminar">✕</button>
      </div>`).join('') : '<p class="muted">Sin registros.</p>';

    return `<div class="card">
      <h3 class="card__title">Vacaciones, permisos e incapacidades</h3>
      ${vig ? `<div class="banner banner--warn">Actualmente: <b>${label(vig.tipo)}</b> hasta el ${U().fechaCorta(vig.hasta)}.</div>` : ''}
      <div class="saldo">
        <div><b>${saldo.disponibles}</b><span class="muted">Días disponibles</span></div>
        <div><b>${saldo.usados}</b><span class="muted">Usados ${saldo.year}</span></div>
        <div><b>${saldo.asignados}</b><span class="muted">Asignados</span></div>
      </div>
      <div id="ausList">${filas}</div>
      <div class="row-gap" style="margin-top:12px"><button class="btn btn--ghost" id="addAus">+ Registrar ausencia</button></div>
    </div>`;
  }

  // Conecta los botones de la tarjeta. onChange se llama tras guardar/borrar.
  function wire(root, emp, onChange) {
    const add = root.querySelector('#addAus');
    if (add) add.onclick = () => formulario(emp, onChange);
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await U().confirm('¿Eliminar este registro de ausencia?', { danger: true, ok: 'Eliminar' }))) return;
      await R().absenceRepository.remove(+b.dataset.del);
      U().toast('Registro eliminado', 'ok');
      onChange && onChange();
    });
  }

  function formulario(emp, onChange) {
    const hoy = hoyISO();
    const html = `<div class="form-grid">
      <label class="f f--full"><span>Tipo *</span>
        <select class="input" id="ausTipo">${TIPOS.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></label>
      <label class="f"><span>Desde *</span><input class="input" id="ausDesde" type="date" value="${hoy}"></label>
      <label class="f"><span>Hasta *</span><input class="input" id="ausHasta" type="date" value="${hoy}"></label>
      <label class="f f--full"><span>Motivo / observaciones</span><input class="input" id="ausMotivo" placeholder="Opcional"></label>
      <div class="f f--full"><span id="ausCalc" class="muted">1 día</span></div>
    </div>`;

    const mo = U().modal(html, {
      title: 'Registrar ausencia · ' + emp.nombreCompleto,
      buttons: [
        { label: 'Cancelar' },
        { label: 'Guardar', variant: 'primary', onClick: (back) => { guardar(back); return true; } },
      ],
    });

    const d = mo.el.querySelector('#ausDesde'), h = mo.el.querySelector('#ausHasta'), calc = mo.el.querySelector('#ausCalc');
    const recalcular = () => {
      const n = R().absenceRepository.diasHabiles(d.value, h.value);
      calc.textContent = n > 0 ? `${n} día${n === 1 ? '' : 's'}` : 'Rango de fechas inválido';
    };
    d.onchange = h.onchange = recalcular;

    async function guardar(back) {
      const tipo = mo.el.querySelector('#ausTipo').value;
      const desde = d.value, hasta = h.value;
      const motivo = mo.el.querySelector('#ausMotivo').value.trim();
      if (!desde || !hasta) return U().toast('Indica las fechas', 'warn');
      const dias = R().absenceRepository.diasHabiles(desde, hasta);
      if (dias <= 0) return U().toast('La fecha final no puede ser anterior al inicio', 'warn');

      if (tipo === 'VACACIONES') {
        const s = await R().absenceRepository.saldoVacaciones(emp.id, +desde.slice(0, 4));
        if (dias > s.disponibles) {
          const seguir = await U().confirm(`Este registro usa <b>${dias}</b> días pero solo quedan <b>${s.disponibles}</b> disponibles. ¿Registrar de todas formas?`, { ok: 'Registrar' });
          if (!seguir) return;
        }
      }

      await R().absenceRepository.add({ colaboradorId: emp.id, tipo, desde, hasta, motivo, estado: 'APROBADA' });
      await R().auditRepository.add('AUSENCIA', emp.id, tipo, '', `${desde} → ${hasta}`);

      // Si la ausencia cubre hoy, reflejarlo en la ubicación actual.
      const hy = hoyISO();
      if (desde <= hy && hasta >= hy && tipo !== 'OTRO') {
        await R().employeeRepository.update(emp.id, { ubicacionActual: tipo });
      }
      U().toast('Ausencia registrada', 'ok');
      back && back.classList.add('modal-back--out');
      setTimeout(() => { const el = document.querySelector('.modal-back--out'); if (el) el.remove(); }, 200);
      onChange && onChange();
    }
  }

  return { cardHTML, wire, formulario, TIPOS, label };
})();
