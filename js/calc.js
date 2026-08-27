/* ============================================================================
 * calc.js — Cálculos dinámicos (nunca se almacenan como valor fijo)
 * antigüedad, edad, rotación, aniversarios, categorías. Sin dependencias.
 * Diseñado para ser probado también en Node (module.exports al final).
 * ==========================================================================*/
(function (root) {
  function parseDate(v) {
    if (v == null || v === '') return null;
    let d = null;
    if (v instanceof Date) { d = isNaN(v) ? null : v; }
    else if (typeof v === 'number') { const t = new Date(Date.UTC(1899, 11, 30) + v * 86400000); d = isNaN(t) ? null : t; }
    else {
      const s = String(v).trim();
      if (!s) return null;
      const t = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
      d = isNaN(t) ? null : t;
    }
    if (!d) return null;
    // Centinela de Excel para "vacío / no aplica" (1899-12-30/31, 1900-01-01): descartar.
    if (d.getFullYear() < 1950) return null;
    return d;
  }

  // Diferencia calendario años/meses/días entre dos fechas.
  function diffYMD(from, to) {
    from = parseDate(from); to = parseDate(to) || new Date();
    if (!from) return null;
    let y = to.getFullYear() - from.getFullYear();
    let m = to.getMonth() - from.getMonth();
    let d = to.getDate() - from.getDate();
    if (d < 0) { m--; const prev = new Date(to.getFullYear(), to.getMonth(), 0); d += prev.getDate(); }
    if (m < 0) { y--; m += 12; }
    const totalDays = Math.floor((to - from) / 86400000);
    return { years: y, months: m, days: d, totalDays };
  }

  function antiguedad(fechaIngreso, ref) {
    const r = diffYMD(fechaIngreso, ref);
    if (!r) return { text: '—', years: 0, months: 0, days: 0, totalDays: 0, categoria: 'sin_dato' };
    r.text = `${r.years} año${r.years === 1 ? '' : 's'}, ${r.months} mes${r.months === 1 ? '' : 'es'}, ${r.days} día${r.days === 1 ? '' : 's'}`;
    r.categoria = categoriaAntiguedad(r.totalDays);
    return r;
  }

  function categoriaAntiguedad(totalDays) {
    const m = totalDays / 30.4375;
    if (m < 3) return 'menos_3m';
    if (m < 6) return '3_6m';
    if (m < 12) return '6m_1a';
    if (m < 24) return '1_2a';
    if (m < 60) return '2_5a';
    return 'mas_5a';
  }
  const CAT_ANTIGUEDAD = {
    menos_3m: 'Menos de 3 meses', '3_6m': '3 a 6 meses', '6m_1a': '6 meses a 1 año',
    '1_2a': '1 a 2 años', '2_5a': '2 a 5 años', mas_5a: 'Más de 5 años', sin_dato: 'Sin dato',
  };

  function edad(fechaNacimiento, ref) {
    const r = diffYMD(fechaNacimiento, ref);
    return r ? r.years : null;
  }

  // ---- Rotación ----
  // Rotación % = Bajas del período / Promedio de colaboradores × 100
  // Promedio = (Headcount inicial + Headcount final) / 2
  function rotacion(hcInicial, hcFinal, bajas) {
    const promedio = (hcInicial + hcFinal) / 2;
    const pct = promedio > 0 ? (bajas / promedio) * 100 : 0;
    return { hcInicial, hcFinal, bajas, promedio, pct: Math.round(pct * 100) / 100 };
  }

  // Headcount activo a una fecha dada, a partir de movimientos ALTA/BAJA/REINGRESO.
  // colaboradores: [{id, fechaIngreso, fechaBaja, estado}]
  function headcountA(colaboradores, fechaISO) {
    const ref = parseDate(fechaISO);
    let count = 0;
    for (const c of colaboradores) {
      const ing = parseDate(c.fechaIngreso);
      const baja = parseDate(c.fechaBaja);
      if (ing && ing <= ref && (!baja || baja > ref)) count++;
    }
    return count;
  }

  // Bajas dentro de un rango [desde, hasta].
  function bajasEnRango(colaboradores, desdeISO, hastaISO) {
    const d = parseDate(desdeISO), h = parseDate(hastaISO);
    return colaboradores.filter((c) => {
      const b = parseDate(c.fechaBaja);
      return b && b >= d && b <= h;
    }).length;
  }
  function altasEnRango(colaboradores, desdeISO, hastaISO) {
    const d = parseDate(desdeISO), h = parseDate(hastaISO);
    return colaboradores.filter((c) => {
      const i = parseDate(c.fechaIngreso);
      return i && i >= d && i <= h;
    }).length;
  }

  // Aniversarios laborales alcanzados en un mes/año dado.
  const HITOS = [1, 2, 3, 5, 10, 15, 20, 25, 30];
  function aniversariosDelMes(colaboradores, year, month /*0-11*/) {
    const out = [];
    for (const c of colaboradores) {
      const ing = parseDate(c.fechaIngreso);
      if (!ing) continue;
      if (ing.getMonth() === month) {
        const years = year - ing.getFullYear();
        if (years > 0 && HITOS.includes(years)) {
          out.push({ colaborador: c, years, dia: ing.getDate() });
        }
      }
    }
    return out.sort((a, b) => a.dia - b.dia);
  }

  // Cumpleaños: hoy, semana, mes, próximos.
  function cumpleClasificados(colaboradores, ref) {
    ref = ref || new Date();
    const y = ref.getFullYear();
    const startOfDay = new Date(y, ref.getMonth(), ref.getDate());
    const out = { hoy: [], semana: [], mes: [], proximos: [] };
    for (const c of colaboradores) {
      const fn = parseDate(c.fechaNacimiento);
      if (!fn) continue;
      let next = new Date(y, fn.getMonth(), fn.getDate());
      if (next < startOfDay) next = new Date(y + 1, fn.getMonth(), fn.getDate());
      const diffDays = Math.round((next - startOfDay) / 86400000);
      const item = { colaborador: c, fecha: next, dia: fn.getDate(), mes: fn.getMonth(), edad: edad(fn, next), diffDays };
      if (diffDays === 0) out.hoy.push(item);
      if (diffDays >= 0 && diffDays <= 7) out.semana.push(item);
      if (fn.getMonth() === ref.getMonth()) out.mes.push(item);
      if (diffDays >= 0 && diffDays <= 30) out.proximos.push(item);
    }
    const bydiff = (a, b) => a.diffDays - b.diffDays;
    out.semana.sort(bydiff); out.proximos.sort(bydiff);
    out.mes.sort((a, b) => a.dia - b.dia);
    return out;
  }

  const api = {
    parseDate, diffYMD, antiguedad, categoriaAntiguedad, CAT_ANTIGUEDAD,
    edad, rotacion, headcountA, bajasEnRango, altasEnRango,
    aniversariosDelMes, cumpleClasificados, HITOS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.Calc = api; }
})(typeof window !== 'undefined' ? window : globalThis);
