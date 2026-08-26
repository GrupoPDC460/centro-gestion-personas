/* charts.js — Gráficos SVG minimalistas sin dependencias (dona, barras, línea) */
window.App = window.App || {};
App.Charts = (function () {
  const PAL = ['#00216f', '#ff5100', '#7dbfe6', '#f3b24e', '#72bd53', '#ce392c', '#5db9a3', '#95adb5', '#b8e44f'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function donut(data, opts) { // data: [{label,value}]
    opts = opts || {};
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const R = 60, r = 38, cx = 70, cy = 70; let ang = -Math.PI / 2; let paths = '';
    data.forEach((d, i) => {
      const frac = d.value / total; const a2 = ang + frac * 2 * Math.PI;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
      const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
      const xi2 = cx + r * Math.cos(a2), yi2 = cy + r * Math.sin(a2);
      const xi1 = cx + r * Math.cos(ang), yi1 = cy + r * Math.sin(ang);
      if (d.value > 0) paths += `<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi2} ${yi2} A${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${PAL[i % PAL.length]}"><title>${esc(d.label)}: ${d.value}</title></path>`;
      ang = a2;
    });
    const legend = data.map((d, i) => `<div class="lg"><span class="lg__dot" style="background:${PAL[i % PAL.length]}"></span>${esc(d.label)} <b>${d.value}</b></div>`).join('');
    return `<div class="chart chart--donut"><svg viewBox="0 0 140 140" width="140" height="140">${paths}<text x="70" y="66" text-anchor="middle" class="chart__big">${total}</text><text x="70" y="82" text-anchor="middle" class="chart__cap">${esc(opts.centerLabel || 'total')}</text></svg><div class="chart__legend">${legend}</div></div>`;
  }

  function bars(data, opts) { // data:[{label,value}] o [{label,value,value2}]
    opts = opts || {};
    const w = 320, h = 160, pad = 24, bw = (w - pad * 2) / data.length;
    const max = Math.max(1, ...data.map((d) => Math.max(d.value || 0, d.value2 || 0)));
    let bars = '';
    data.forEach((d, i) => {
      const x = pad + i * bw;
      const groups = opts.dual ? 2 : 1;
      const gw = (bw - 8) / groups;
      [['value', PAL[0]], ['value2', PAL[1]]].slice(0, groups).forEach(([k, col], gi) => {
        const v = d[k] || 0; const bh = (v / max) * (h - pad * 2);
        bars += `<rect x="${x + 4 + gi * gw}" y="${h - pad - bh}" width="${gw - 2}" height="${bh}" rx="2" fill="${col}"><title>${esc(d.label)}: ${v}</title></rect>`;
      });
      bars += `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" class="chart__ax">${esc(String(d.label).slice(0, 6))}</text>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg></div>`;
  }

  function line(data, opts) { // data:[{label,value}]
    opts = opts || {};
    const w = 340, h = 160, pad = 28;
    const max = Math.max(1, ...data.map((d) => d.value));
    const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    const pts = data.map((d, i) => [pad + i * step, h - pad - (d.value / max) * (h - pad * 2)]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L${pts.length ? pts[pts.length - 1][0] : pad} ${h - pad} L${pad} ${h - pad} Z`;
    const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${PAL[0]}"><title>${esc(data[i].label)}: ${data[i].value}</title></circle>`).join('');
    const labels = data.map((d, i) => `<text x="${pad + i * step}" y="${h - 8}" text-anchor="middle" class="chart__ax">${esc(String(d.label).slice(0, 3))}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><path d="${area}" fill="${PAL[0]}22"/><path d="${path}" fill="none" stroke="${PAL[0]}" stroke-width="2"/>${dots}${labels}</svg></div>`;
  }

  return { donut, bars, line, PAL };
})();
