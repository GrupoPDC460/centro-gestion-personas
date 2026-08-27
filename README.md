# Centro de Gestión de Personas — Grupo PDC

> **Backend en la nube (Supabase).** Desde esta versión, los datos ya no viven en el
> navegador: se almacenan de forma **centralizada en Supabase (PostgreSQL)**, con
> acceso **multiusuario** desde cualquier equipo. El acceso está protegido con
> **inicio de sesión** y **RLS por lista de autorizados** (solo usuarios autorizados
> ven la información). Se aloja en un esquema propio de tablas `cgp_*` dentro del
> proyecto Supabase, de forma independiente de la intranet y de Ford.
>
> - **Acceso:** pantalla de login (correo + contraseña). Cambia tu contraseña en
>   *Configuración → Mi cuenta*.
> - **Configuración de conexión:** `js/config.js` (URL + llave pública; la llave es
>   pública por diseño, la seguridad la da el RLS).
> - **Capa de datos:** `js/db.js` habla con Supabase manteniendo la misma interfaz
>   que usaban los repositorios (las vistas no cambiaron). La versión anterior
>   basada en IndexedDB queda como respaldo en `js/db.indexeddb.bak`.

---


Aplicación web **independiente** para administrar el personal de la organización: colaboradores, información personal y laboral, altas y bajas, reingresos, rotación, cumpleaños, aniversarios, contactos de emergencia y organigrama.

> Proyecto **100% autónomo**. No comparte código, base de datos ni configuración con la intranet ni con ningún otro proyecto.

---

## Objetivo

Reemplazar el manejo del personal en hojas de cálculo por una aplicación con datos estructurados, cálculos dinámicos correctos (antigüedad, edad, rotación) y persistencia local, preparada para evolucionar a un backend real.

## Funcionalidades implementadas

- **Dashboard ejecutivo** con métricas calculadas en vivo (activos, hombres/mujeres, altas/bajas del mes, rotación mensual y acumulada, antigüedad promedio, cumpleaños, personal en sitio/remoto/vacaciones/permiso/ausente) y gráficos (dona, línea, barras).
- **Colaboradores**: alta, edición, consulta, búsqueda instantánea (nombre, código, JDE, correo, teléfono) y filtros combinables (departamento, puesto, estado, género, antigüedad).
- **Ficha del colaborador**: información personal y laboral, contacto de emergencia, historial de movimientos, acciones `tel:`/`mailto:`, y **fotografía** (carga/cambio; JPG/PNG/WEBP; se guarda en IndexedDB y persiste).
- **Altas y Bajas**: registro con históricos (mes/trimestre/año) y gráfico Altas vs Bajas. La baja **no elimina**: cambia el estado a `INACTIVO` y conserva el historial.
- **Reingresos**: una persona puede tener varios ciclos ingreso/baja sin duplicarse.
- **Rotación**: `bajas ÷ promedio de plantilla × 100`, con selección de período (mes/trimestre/semestre/año) y rotación mensual histórica.
- **Cumpleaños**: hoy, esta semana, este mes y próximos 30 días.
- **Aniversarios laborales**: detección automática de hitos (1, 2, 3, 5, 10, 15, 20, 25, 30 años).
- **Árbol de emergencia**: contactos de emergencia por colaborador y alerta de faltantes.
- **Organigrama** dinámico por jefatura (Nombre/Código de Líder).
- **Reportes**: headcount por departamento/puesto/país/género/antigüedad/estado; exportación a **CSV** y **XLSX**.
- **Importación** de colaboradores desde **XLSX/CSV** con detección de encabezados, mapeo automático del formato Grupo PDC, preview, detección de duplicados y confirmación.
- **Respaldo / restauración**: exportación completa a JSON (incluye fotos) y restauración con advertencia previa.
- **Auditoría** de cambios (alta, baja, reingreso, cambio de departamento/puesto/foto).
- **Búsqueda global**, **modo claro/oscuro** (preferencia persistente) y diseño **responsive**.

## Arquitectura

```
Frontend (vistas)  →  Repositorios  →  IndexedDB
```

La interfaz **no** habla con IndexedDB directamente: pasa por la capa de **repositorios** (`js/repositories.js`). Para migrar a un backend real (API → SQL Server) se reescribe **sólo** esa capa; las vistas no cambian.

```
Frontend  →  Repositorios  →  API  →  Backend  →  SQL Server   (evolución futura)
```

### Estructura

```
centro-gestion-personas/
├── index.html
├── css/            styles.css · components.css
├── js/
│   ├── db.js               (IndexedDB: esquema, índices, CRUD)
│   ├── repositories.js     (capa de repositorios)
│   ├── calc.js             (antigüedad, edad, rotación, aniversarios)
│   ├── charts.js           (gráficos SVG sin dependencias)
│   ├── import.js           (importación XLSX/CSV + mapeo)
│   ├── ui.js               (router, modales, toasts, tema, backup)
│   ├── app.js              (arranque + seed + búsqueda global)
│   └── views/              (dashboard, employees, movements, organization, settings)
├── vendor/         xlsx.full.min.js  (SheetJS, auto-alojado)
├── data/           demo-seed.js  (datos DEMO ficticios)
└── test/           smoke.js  (prueba end-to-end)
```

## Tecnología

HTML5 + CSS3 + JavaScript moderno (sin framework) · **IndexedDB** para persistencia · SheetJS para XLSX. Sin backend: funciona como sitio estático.

## Ejecución local

Por las restricciones de `file://` en algunos navegadores, se recomienda un servidor estático:

```bash
npx serve .        # o: python3 -m http.server
```

Y abrir la URL indicada. (También puede abrirse `index.html` directamente en la mayoría de navegadores.)

## Importar los datos reales

1. Abre **Configuración → Importar colaboradores**.
2. Selecciona el Excel (`demo-cobros venta directa.xlsx` u otro con el mismo formato).
3. Revisa el preview (nuevos / duplicados) y confirma.

Los datos quedan **sólo en tu navegador** (IndexedDB). El Excel se usa únicamente para la carga inicial; la app funciona de forma independiente después.

> Los datos DEMO iniciales son **ficticios**. Para trabajar con datos reales: Configuración → Zona de peligro → *Borrar todos los datos locales* y luego importa el Excel.

## Respaldo

- **Exportar respaldo**: genera un JSON con toda la base (incluye fotos).
- **Restaurar respaldo**: reemplaza la base actual (pide confirmación).

## Pruebas

```bash
npm install    # jsdom + fake-indexeddb (sólo desarrollo)
npm test       # prueba end-to-end: arranque, seed, alta/baja, import, backup, cálculos
```

## Publicación

Sitio estático — se puede publicar en **Vercel**, **GitHub Pages** o **Netlify** sin backend. En Vercel: ligar el repositorio; cada `git push` a `main` despliega automáticamente. No requiere variables de entorno en esta versión.

## Privacidad (MVP local)

La app maneja información personal, por lo que en esta versión **todo es local**: no se envía información a servicios externos, no se usan APIs externas para datos, y las fotos se almacenan en IndexedDB. **Limitación conocida:** al ser almacenamiento local del navegador, los datos residen sin cifrado en el equipo y no se comparten entre dispositivos/usuarios; la sincronización multiusuario llegará con el backend.

## Preparado para el futuro backend

`employeeRepository`, `movementRepository`, `departmentRepository`, `positionRepository`, `catalogRepository`, `auditRepository`, `settingsRepository` — reimplementables contra una API sin tocar las vistas.
