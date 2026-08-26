/* demo-seed.js — Datos DEMO 100% ficticios (no contienen información real).
 * Se cargan sólo en el primer arranque, si la base está vacía, para que la
 * app no aparezca vacía. Bórralos desde Configuración → Zona de peligro y
 * luego importa el Excel real (los datos reales quedan sólo en tu navegador). */
window.App = window.App || {};
App.DEMO_SEED = {
  departamentos: ['Cobros Venta Directa'],
  puestos: ['Líder de Cobros Venta Directa', 'Asistente Jr. de Cobros Venta Directa', 'Encargado Sr. de Cobros Venta Directa'],
  tipos: ['Interno', 'Externo'],
  colaboradores: [
    { codigo: 'DEMO-001', codigoJDE: '9000001', nombreCompleto: 'Ana Sofía Ramírez López', genero: 'Femenino', fechaNacimiento: '1990-08-30', fechaIngreso: '2016-03-01', pais: 'Guatemala', dep: 0, pue: 0, tipo: 0, rol: 'Liderazgo', celular: '+50250000001', correoCorporativo: 'demo.ana@ejemplo.com', jefeCodigo: '', ubic: 'EN_SITIO', emg: { nombre: 'Carlos Ramírez', parentesco: 'Hermano', telefono: '+50255500001' } },
    { codigo: 'DEMO-002', codigoJDE: '9000002', nombreCompleto: 'Luis Fernando Morales Cruz', genero: 'Masculino', fechaNacimiento: '1997-09-02', fechaIngreso: '2022-07-15', pais: 'Guatemala', dep: 0, pue: 1, tipo: 0, rol: 'Operativo', celular: '+50250000002', correoCorporativo: 'demo.luis@ejemplo.com', jefeCodigo: 'DEMO-001', ubic: 'REMOTO', emg: { nombre: 'María Cruz', parentesco: 'Madre', telefono: '+50255500002' } },
    { codigo: 'DEMO-003', codigoJDE: '9000003', nombreCompleto: 'Yoselin De Los Santos', genero: 'Femenino', fechaNacimiento: '1994-01-20', fechaIngreso: '2019-11-04', pais: 'República Dominicana', dep: 0, pue: 2, tipo: 0, rol: 'Liderazgo', celular: '+18090000003', correoCorporativo: 'demo.yoselin@ejemplo.com', jefeCodigo: 'DEMO-001', ubic: 'EN_SITIO', emg: { nombre: 'Pedro De Los Santos', parentesco: 'Padre', telefono: '+18095500003' } },
    { codigo: 'DEMO-004', codigoJDE: '9000004', nombreCompleto: 'Kevin Alexander Pérez', genero: 'Masculino', fechaNacimiento: '2001-08-28', fechaIngreso: '2026-07-10', pais: 'El Salvador', dep: 0, pue: 1, tipo: 1, rol: 'Operativo', celular: '+50370000004', correoCorporativo: 'demo.kevin@ejemplo.com', jefeCodigo: 'DEMO-003', ubic: 'EN_SITIO', emg: { nombre: '', parentesco: '', telefono: '' } },
    { codigo: 'DEMO-005', codigoJDE: '9000005', nombreCompleto: 'Gabriela Nohemí Estrada', genero: 'Femenino', fechaNacimiento: '1988-12-11', fechaIngreso: '2013-02-18', pais: 'Guatemala', dep: 0, pue: 2, tipo: 0, rol: 'Operativo', celular: '+50250000005', correoCorporativo: 'demo.gabriela@ejemplo.com', jefeCodigo: 'DEMO-001', ubic: 'VACACIONES', emg: { nombre: 'José Estrada', parentesco: 'Cónyuge', telefono: '+50255500005' } },
    { codigo: 'DEMO-006', codigoJDE: '9000006', nombreCompleto: 'Diego Armando Solís', genero: 'Masculino', fechaNacimiento: '1999-06-05', fechaIngreso: '2023-01-09', fechaBaja: '2026-05-30', estado: 'INACTIVO', motivoBaja: 'Renuncia voluntaria', tipoBaja: 'Voluntaria', pais: 'Guatemala', dep: 0, pue: 1, tipo: 0, rol: 'Operativo', celular: '+50250000006', correoCorporativo: 'demo.diego@ejemplo.com', jefeCodigo: 'DEMO-001', ubic: 'AUSENTE', emg: { nombre: 'Rosa Solís', parentesco: 'Madre', telefono: '+50255500006' } },
  ],
};
