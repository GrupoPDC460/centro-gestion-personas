/* ============================================================================
 * photo-editor.js — Editor de recorte de fotografía
 * Permite encuadrar la cara: arrastrar para mover y control de zoom, sobre un
 * marco circular. Devuelve un dataURL cuadrado listo para el avatar.
 * ==========================================================================*/
window.App = window.App || {};

App.PhotoEditor = (function () {
  const SIZE = 320;   // lienzo de edición en pantalla
  const OUT = 400;    // resolución de salida

  function leerImagen(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = fr.result; };
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // Abre el editor y resuelve con el dataURL recortado, o null si se cancela.
  async function abrir(file, U) {
    const img = await leerImagen(file);
    return new Promise((resolve) => {
      const html = `
        <p class="muted" style="margin:0 0 12px">Arrastra la imagen para encuadrar el rostro y ajusta el zoom.</p>
        <div class="cropper">
          <canvas id="cropCanvas" width="${SIZE}" height="${SIZE}"></canvas>
          <div class="cropper__mask"></div>
        </div>
        <label class="f" style="margin-top:14px"><span>Zoom</span>
          <input type="range" id="cropZoom" min="100" max="300" value="100" class="range">
        </label>`;

      let resuelto = false;
      const mo = U.modal(html, {
        title: 'Ajustar fotografía',
        buttons: [
          { label: 'Cancelar', onClick: () => { resuelto = true; resolve(null); } },
          { label: 'Guardar foto', variant: 'primary', onClick: () => { resuelto = true; exportar(); } },
        ],
      });
      // Si se cierra con la X, Esc o clic fuera, se considera cancelado.
      const obs = setInterval(() => {
        if (!document.body.contains(mo.el)) { clearInterval(obs); if (!resuelto) { resuelto = true; resolve(null); } }
      }, 300);

      const cv = mo.el.querySelector('#cropCanvas');
      const ctx = cv.getContext('2d');
      const zoomEl = mo.el.querySelector('#cropZoom');

      // Escala base: la imagen cubre todo el marco (sin bordes vacíos).
      const base = Math.max(SIZE / img.width, SIZE / img.height);
      let zoom = 1, tx = 0, ty = 0;

      function limites() {
        const w = img.width * base * zoom, h = img.height * base * zoom;
        const maxX = Math.max(0, (w - SIZE) / 2), maxY = Math.max(0, (h - SIZE) / 2);
        tx = Math.min(maxX, Math.max(-maxX, tx));
        ty = Math.min(maxY, Math.max(-maxY, ty));
        return { w, h };
      }
      function dibujar() {
        const { w, h } = limites();
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(img, (SIZE - w) / 2 + tx, (SIZE - h) / 2 + ty, w, h);
      }

      // Arrastre (mouse y táctil)
      let drag = false, px = 0, py = 0;
      const start = (x, y) => { drag = true; px = x; py = y; };
      const move = (x, y) => { if (!drag) return; tx += x - px; ty += y - py; px = x; py = y; dibujar(); };
      const end = () => { drag = false; };
      cv.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
      window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
      window.addEventListener('mouseup', end);
      cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
      cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
      cv.addEventListener('touchend', end);
      zoomEl.addEventListener('input', () => { zoom = +zoomEl.value / 100; dibujar(); });

      dibujar();

      function exportar() {
        // Exportar a resolución final manteniendo el mismo encuadre.
        const out = document.createElement('canvas');
        out.width = OUT; out.height = OUT;
        const o = out.getContext('2d');
        const k = OUT / SIZE;
        const w = img.width * base * zoom * k, h = img.height * base * zoom * k;
        o.fillStyle = '#fff'; o.fillRect(0, 0, OUT, OUT);
        o.drawImage(img, (OUT - w) / 2 + tx * k, (OUT - h) / 2 + ty * k, w, h);
        resolve(out.toDataURL('image/jpeg', 0.9));
      }
    });
  }

  return { abrir };
})();
