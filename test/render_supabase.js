/* Renderiza todas las vistas con la capa Supabase simulada + datos reales. */
const fs=require('fs'),path=require('path');const{JSDOM}=require('jsdom');
const XLSX=require('../vendor/xlsx.full.min.js');
const ROOT=path.join(__dirname,'..');
// --- cliente simulado (igual que supabase_mock) ---
function makeClient(){const T={},S={};const E=t=>{if(!T[t]){T[t]=[];S[t]=0;}return T[t];};
class Q{constructor(t){this.t=t;this.op='select';this.f=[];this.p=null;this._s=false;this._m=false;}
select(){return this;} insert(r){this.op='insert';this.p=r;return this;} upsert(r){this.op='upsert';this.p=r;return this;}
delete(){this.op='delete';return this;} eq(c,v){this.f.push(['eq',c,v]);return this;} not(c){this.f.push(['nn',c]);return this;}
single(){this._s=true;return this;} maybeSingle(){this._m=true;return this;}
_mt(r){return this.f.every(([o,c,v])=>o==='nn'?r[c]!=null:String(r[c])===String(v));}
_pk(){return this.t==='cgp_config'?'key':'id';}
_run(){const a=E(this.t),pk=this._pk();
 if(this.op==='select'){const r=a.filter(x=>this._mt(x));if(this._s)return{data:r[0],error:r[0]?null:{message:'no rows'}};if(this._m)return{data:r[0]||null,error:null};return{data:r.map(x=>({...x})),error:null};}
 if(this.op==='insert'||this.op==='upsert'){const L=Array.isArray(this.p)?this.p:[this.p];const out=[];
  for(const row of L){let k=row[pk];if(k==null)k=++S[this.t];const ex=a.find(x=>String(x[pk])===String(k));
   if(ex&&this.op==='upsert'){Object.assign(ex,row,{[pk]:k});out.push(ex);}else{const nr={...row,[pk]:k};a.push(nr);if(k>S[this.t])S[this.t]=k;out.push(nr);} }
  const sel=out.map(r=>({[pk]:r[pk]}));return{data:this._s?sel[0]:sel,error:null};}
 if(this.op==='delete'){T[this.t]=a.filter(x=>!this._mt(x));return{data:null,error:null};}}
then(res,rej){try{res(this._run());}catch(e){rej(e);}}}
return{from:t=>new Q(t),auth:{getSession:async()=>({data:{session:{user:{email:'t@t.com'}}}}),onAuthStateChange(){return{data:{}}}}};}

const dom=new JSDOM(fs.readFileSync(ROOT+'/index.html','utf8'),{url:'http://localhost/#dashboard',runScripts:'outside-only',pretendToBeVisual:true});
const{window}=dom;const document=window.document;
window.XLSX=XLSX; window.supabase={createClient:()=>makeClient()};
window.URL.createObjectURL=()=>'x';window.URL.revokeObjectURL=()=>{};
window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},clearRect(){},fillRect(){},set fillStyle(v){}});window.SVGElement&&0;
window.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/jpeg;base64,MOCK';
const load=r=>window.eval(fs.readFileSync(path.join(ROOT,r),'utf8'));
['js/config.js','js/supabase.js','js/db.js','js/repositories.js','js/calc.js','js/charts.js','js/import.js','js/ui.js',
 'js/photo-editor.js','js/absences.js','js/export.js',
 'js/views/dashboard.js','js/views/employees.js','js/views/movements.js','js/views/organization.js','js/views/settings.js'].forEach(load);
const wait=ms=>new Promise(r=>setTimeout(r,ms));const A=window.App;
(async()=>{
  const buf=fs.readFileSync('/mnt/user-data/uploads/demo-cobros_venta_directa.xlsx');
  const rows=XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true}).Sheets['Hoja1'],{header:1,raw:true,defval:null});
  await A.Import.commit(A.Import.toRawRecords(rows).map(A.Import.toModel),'omitir');
  const emps=await A.Repos.employeeRepository.all();
  console.log('Colaboradores:',emps.length);
  // ausencia de prueba + saldo
  await A.Repos.absenceRepository.add({colaboradorId:emps[0].id,tipo:'VACACIONES',desde:'2026-08-01',hasta:'2026-08-05',estado:'APROBADA'});
  const s=await A.Repos.absenceRepository.saldoVacaciones(emps[0].id);
  console.log('Saldo vacaciones:',JSON.stringify(s),s.usados===5&&s.disponibles===10?'OK':'FALLA');
  // organigrama override
  await A.Repos.orgChartRepository.save({overrides:{[emps[1].id]:String(emps[0].codigo)},ocultos:[]});
  const cfg=await A.Repos.orgChartRepository.load();
  console.log('Organigrama guardado:',cfg&&cfg.overrides?'OK':'FALLA');
  let fallos=0;
  for(const r of ['dashboard','empleados','organizacion','emergencia','reportes','cumpleanos','altas-bajas','rotacion','configuracion']){
    window.location.hash='#'+r;
    try{ await A.UI.render(); await wait(60);
      const v=document.getElementById('view');
      const err=v.querySelector('.empty h3')&&/Error/.test(v.querySelector('.empty h3').textContent);
      if(err){fallos++;console.log(`  ✗ ${r} -> ${v.querySelector('.empty p').textContent}`);}
      else console.log(`  ✓ ${r} (${v.innerHTML.length} bytes)`);
    }catch(e){fallos++;console.log(`  ✗ ${r} EXCEPCIÓN: ${e.message}`);}
  }
  // abrir ficha (incluye tarjeta de ausencias)
  window.location.hash='#empleados'; await A.UI.render(); await wait(80);
  const card=document.querySelector('.pcard');
  console.log('\nVista tarjetas:',card?'OK':'no renderizó');
  if(card){ card.click(); await wait(150);
    const m=document.querySelector('.modal');
    const aus=document.querySelector('#ausWrap');
    console.log('Ficha abre:',m?'OK':'FALLA','| tarjeta ausencias:',aus?'OK':'FALLA');
    if(!m||!aus)fallos++;
  }
  console.log(`\n==== ${fallos} problema(s) ====`);
  process.exit(fallos?1:0);
})().catch(e=>{console.error('HARNESS:',e);process.exit(2);});
