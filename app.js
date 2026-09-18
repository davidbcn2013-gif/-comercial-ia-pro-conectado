import { supabase } from './src/auth.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const KEY='ciapro_state_v1';
const DEFAULT={
  activeTab:'home',
  tariffs:{Fresco:null,X:null,XY:null,Z:null,W:null},
  products:[],
  clients:[],
  offers:[],
  stockouts:[],
  alternatives:[],
  modules:{map:false,cyc:true,routes:false},
  settings:{sender:'David Salmerón',company:'',logo:'',cycEmail:''},
  cycRequests:[]
};
let state=load();
let selectedOffer={clientId:'',fresh:[],frozen:null,frozenProducts:[]};
let tariffFilter='all';
let currentUser=null;
let syncTimer=null;

function load(){try{return {...DEFAULT,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return structuredClone(DEFAULT)}}
function save(){
  localStorage.setItem(KEY,JSON.stringify(state));
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncAll().catch(e=>console.warn('Supabase sync:',e)),350);
}

async function syncAll(){
  if(!currentUser) return;
  const uid=currentUser.id;
  await supabase.from('user_settings').upsert({user_id:uid,sender:state.settings.sender||'David Salmerón',company:state.settings.company||'',logo:state.settings.logo||'',cyc_email:state.settings.cycEmail||''},{onConflict:'user_id'});
  const mods=Object.entries(state.modules||{}).map(([module_key,enabled])=>({user_id:uid,module_key,enabled:!!enabled}));
  if(mods.length) await supabase.from('user_modules').upsert(mods,{onConflict:'user_id,module_key'});
  if(state.clients.length) await supabase.from('clients').upsert(state.clients.map(c=>({id:c.id,user_id:uid,name:c.name,contact:c.contact||'',phone:c.phone||'',email:c.email||'',nif:c.nif||'',fiscal_name:c.fiscal_name||c.fiscal||'',commercial_name:c.commercial_name||c.commercial||c.name,address:c.address||'',city:c.city||'',province:c.province||'',postal_code:c.postal_code||c.postal||'',notes:c.notes||'',status:c.status||'',potential:c.potential||null,next_action:c.next_action||''})),{onConflict:'id'});
  const tariffRows=[];
  for(const [key,t] of Object.entries(state.tariffs||{})){ if(t) tariffRows.push({id:t.id||crypto.randomUUID(),user_id:uid,tariff_key:key,filename:t.filename||'',loaded_at:t.loadedAt||new Date().toISOString(),version:t.version||1,is_active:true}); }
  if(tariffRows.length) await supabase.from('tariffs').upsert(tariffRows,{onConflict:'id'});
  if(state.products.length) await supabase.from('products').upsert(state.products.map(p=>({id:p.id,user_id:uid,tariff_id:p.tariffId||null,tariff_key:p.tariff||null,code:p.code,name:p.name,format:p.format||'',price:Number(p.price)||0,unit:p.unit||'',stock:p.stock!==false})),{onConflict:'id'});
  if(state.offers.length) await supabase.from('offers').upsert(state.offers.map(o=>({id:o.id,user_id:uid,client_id:o.clientId||null,tariffs:o.tariffs,created_at:o.createdAt,payload:{clientName:o.clientName||'',items:o.items||[]}})),{onConflict:'id'});
  if(state.cycRequests.length) await supabase.from('cyc_requests').upsert(state.cycRequests.map(r=>({id:r.id,user_id:uid,client_id:r.clientId||null,amount:Number(r.amount)||0,nif:r.nif||'',contact_name:r.contactName||'',phone:r.phone||'',fiscal_name:r.fiscal||r.fiscal_name||'',commercial_name:r.commercial||r.commercial_name||r.client||'',address:r.address||'',city:r.city||'',province:r.province||'',postal_code:r.postal||r.postal_code||'',created_at:r.createdAt||new Date().toISOString(),status:r.status||'created'})),{onConflict:'id'});
}

async function loadRemote(){
  const [profile,mods,settings,clients,tariffs,products,offers,cyc]=await Promise.all([
    supabase.from('profiles').select('*').eq('id',currentUser.id).maybeSingle(),
    supabase.from('user_modules').select('module_key,enabled').eq('user_id',currentUser.id),
    supabase.from('user_settings').select('*').eq('user_id',currentUser.id).maybeSingle(),
    supabase.from('clients').select('*').eq('user_id',currentUser.id).order('created_at'),
    supabase.from('tariffs').select('*').eq('user_id',currentUser.id).eq('is_active',true).order('loaded_at',{ascending:false}),
    supabase.from('products').select('*').eq('user_id',currentUser.id).order('created_at'),
    supabase.from('offers').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
    supabase.from('cyc_requests').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false})
  ]);
  if(profile.error) throw profile.error;
  if(clients.error) throw clients.error;
  if(tariffs.error) throw tariffs.error;
  if(products.error) throw products.error;
  if(offers.error) throw offers.error;
  if(cyc.error) throw cyc.error;
  if(clients.data?.length) state.clients=clients.data.map(c=>({id:c.id,name:c.name,contact:c.contact||'',phone:c.phone||'',email:c.email||'',nif:c.nif||'',fiscal:c.fiscal_name||'',commercial:c.commercial_name||c.name,address:c.address||'',city:c.city||'',province:c.province||'',postal:c.postal_code||'',notes:c.notes||'',status:c.status||'',potential:c.potential,next_action:c.next_action||''}));
  if(tariffs.data?.length){ for(const k of ['Fresco','X','XY','Z','W']){const t=tariffs.data.find(x=>x.tariff_key===k);state.tariffs[k]=t?{id:t.id,filename:t.filename,loadedAt:t.loaded_at,version:t.version}:null;} }
  if(products.data?.length) state.products=products.data.map(p=>({id:p.id,code:p.code,name:p.name,format:p.format||'',price:Number(p.price),unit:p.unit||'',stock:p.stock,tariff:p.tariff_key||'',tariffId:p.tariff_id||null}));
  if(offers.data?.length) state.offers=offers.data.map(o=>({id:o.id,clientId:o.client_id||'',clientName:o.payload?.clientName||'',tariffs:o.tariffs,createdAt:o.created_at,items:o.payload?.items||[]}));
  if(cyc.data?.length) state.cycRequests=cyc.data.map(r=>({id:r.id,createdAt:r.created_at,clientId:r.client_id||'',amount:r.amount,nif:r.nif,contactName:r.contact_name,phone:r.phone,fiscal:r.fiscal_name,commercial:r.commercial_name,address:r.address,city:r.city,province:r.province,postal:r.postal_code,status:r.status}));
  if(mods.data?.length) for(const m of mods.data) state.modules[m.module_key]=m.enabled;
  if(settings.data) state.settings={sender:settings.data.sender||state.settings.sender,company:settings.data.company||'',logo:settings.data.logo||'',cycEmail:settings.data.cyc_email||''};
  localStorage.setItem(KEY,JSON.stringify(state));
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){ location.href='./src/login.html'; return; }
  currentUser=session.user;
  try{ await loadRemote(); }catch(e){ console.warn(e); toast('Sesión iniciada. Ejecuta el esquema de Supabase para activar los datos.'); }
  render();
}

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(n){return Number(n||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'})}
function fmtDate(iso){return iso?new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'}):'—'}
function toast(t){let x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2300)}
function activeTariffs(){return Object.entries(state.tariffs).filter(([,v])=>v).map(([k,v])=>({key:k,...v}))}
function go(tab){state.activeTab=tab;save();render()}
function nav(){return `<div class="bottom"><nav>
${[['home','⌂','Inicio'],['tariffs','▤','Tarifas'],['products','□','Productos'],['offers','▱','Listados'],['more','☰','Más']].map(x=>`<button class="${state.activeTab===x[0]?'on':''}" data-go="${x[0]}"><strong>${x[1]}</strong>${x[2]}</button>`).join('')}</nav></div>`}

function render(){
 let body=state.activeTab==='home'?home():state.activeTab==='tariffs'?tariffs():state.activeTab==='products'?products():state.activeTab==='offers'?offers():more();
 document.querySelector('#app').innerHTML=`<div class="shell"><header class="top"><h1>Comercial IA PRO</h1><small>${esc(state.settings.company||'Gestión comercial')}</small></header><main class="content">${body}</main>${nav()}</div>`;
 bind();
}
function home(){return `<div class="hero"><h2>Ventas, tarifas y listados</h2><div>Consulta precios y prepara un listado para enviar al cliente en pocos pasos.</div></div>
<div class="grid">
<div class="card" data-go="tariffs"><h3>📋 Tarifas</h3><div class="muted">${activeTariffs().length}/5 tarifas cargadas</div></div>
<div class="card" data-go="products"><h3>🔎 Productos</h3><div class="muted">${state.products.length} artículos</div></div>
<div class="card" data-go="offers"><h3>🧾 Listados</h3><div class="muted">${state.offers.length} generados</div></div>
<div class="card" data-action="new-offer"><h3>➕ Crear listado</h3><div class="muted">Fresco + un congelado</div></div>
${state.modules.cyc?'<div class="card" data-action="cyc"><h3>💳 Crédito y Caución</h3><div class="muted">Alta de cliente C y C</div></div>':''}
</div>
<div class="section"><div class="card"><h3>Estado de tarifas</h3>${activeTariffs().length?activeTariffs().map(t=>`<div class="tariff section"><div><b>${esc(t.key==='Fresco'?'🐟 FRESCO':'❄️ '+t.key)}</b><div class="muted">Cargada ${fmtDate(t.loadedAt)}</div></div><span class="active">ACTIVA</span></div>`).join(''):`<div class="empty">Carga tu primer PDF de tarifa.</div>`}</div></div>`}

function tariffs(){return `<div class="row"><h2 style="margin:0">Tarifas</h2><button class="btn" data-action="upload-tariff">+ Cargar PDF</button></div>
<div class="notice section">Cada PDF guarda automáticamente su fecha y hora de carga. Fresco puede sustituirse a diario; cada congelado conserva su última versión hasta que cargues otra.</div>
<div class="grid section">${['Fresco','X','XY','Z','W'].map(k=>{let t=state.tariffs[k];return `<div class="card tariff"><div><h3>${k==='Fresco'?'🐟 Fresco':'❄️ Congelado '+k}</h3>${t?`<div class="muted">📅 ${fmtDate(t.loadedAt)}</div><div class="muted">${t.filename?esc(t.filename):''}</div>`:`<div class="muted">Sin cargar</div>`}</div><button class="btn secondary" data-upload="${k}">PDF</button></div>`}).join('')}</div>
<div class="section"><button class="btn secondary" data-action="import-demo">Importar ejemplo</button></div>`}

function products(){
let arr=state.products.filter(p=>tariffFilter==='all'||p.tariff===tariffFilter);
return `<div class="row"><h2 style="margin:0">Productos</h2><button class="btn gold" data-action="new-offer">Crear listado</button></div>
<div class="field"><input id="productSearch" placeholder="Buscar por código o nombre..."></div>
<div class="row section">${['all','Fresco','X','XY','Z','W'].map(k=>`<button class="btn ${tariffFilter===k?'':'secondary'}" data-filter="${k}">${k==='all'?'Todos':k}</button>`).join('')}</div>
<div class="card"><table class="table"><thead><tr><th></th><th>Producto</th><th>Tarifa</th><th>Precio</th><th>Estado</th></tr></thead><tbody id="prodRows">${rows(arr)}</tbody></table></div>`}
function rows(arr){return arr.length?arr.map(p=>`<tr><td>${esc(p.code)}</td><td><b>${esc(p.name)}</b><div class="muted">${esc(p.format||'')}</div></td><td>${esc(p.tariff)}</td><td class="price">${money(p.price)} ${esc(p.unit||'')}</td><td class="${p.stock===false?'stock':'active'}">${p.stock===false?'🔴 SIN STOCK':'🟢 Disponible'}</td></tr>`).join(''):`<tr><td colspan="5" class="empty">No hay artículos cargados.</td></tr>`}

function offers(){return `<div class="row"><h2 style="margin:0">Listados</h2><button class="btn" data-action="new-offer">+ Nuevo</button></div>
<div class="section">${state.offers.length?state.offers.slice().reverse().map(o=>`<div class="card section"><div class="row" style="justify-content:space-between"><b>${esc(o.clientName||'Sin cliente')}</b><span class="pill">${fmtDate(o.createdAt)}</span></div><div class="muted">${esc(o.tariffs.join(' + '))} · ${o.items.length} artículos</div><div class="row section"><button class="btn secondary" data-offer="${o.id}">Ver / compartir</button></div></div>`).join(''):`<div class="empty">Todavía no has generado listados.</div>`}</div>`}

function more(){return `<h2>Más</h2><div class="grid">
<div class="card" data-action="clients"><h3>👥 Clientes</h3><div class="muted">Clientes y prospectos</div></div>
${state.modules.cyc?'<div class="card" data-action="cyc"><h3>💳 Crédito y Caución</h3><div class="muted">Solicitudes de riesgo</div></div>':''}
<div class="card" data-action="stock"><h3>🔴 Roturas de stock</h3><div class="muted">Bloquear y reactivar artículos</div></div>
<div class="card" data-action="modules"><h3>📦 Mis paquetes</h3><div class="muted">Mostrar u ocultar módulos</div></div>
<div class="card" data-action="settings"><h3>⚙️ Ajustes</h3><div class="muted">Identidad y correo C y C</div></div>
</div>`}

function modal(html){let d=document.createElement('div');d.className='modal';d.innerHTML=`<div class="modalbox">${html}</div>`;d.addEventListener('click',e=>{if(e.target===d)d.remove()});document.body.appendChild(d);return d}
function clientsModal(){
let d=modal(`<div class="row" style="justify-content:space-between"><h2>Clientes</h2><button class="btn" id="addClient">+ Cliente</button></div><div id="clist">${state.clients.map(c=>`<div class="card section"><b>${esc(c.name)}</b><div class="muted">${esc(c.contact||'')} · ${esc(c.phone||'')}</div><button class="btn secondary section" data-client="${c.id}">Seleccionar</button></div>`).join('')||'<div class="empty">No hay clientes.</div>'}</div>`);
d.querySelector('#addClient').onclick=()=>{let x=prompt('Nombre del cliente');if(!x)return;let c={id:crypto.randomUUID(),name:x,contact:prompt('Nombre del contacto')||'',phone:prompt('Teléfono')||'',nif:prompt('NIF')||'',fiscal:x,commercial:x,address:prompt('Domicilio')||'',city:prompt('Localidad')||'',province:prompt('Provincia')||'',postal:prompt('Código postal')||''};state.clients.push(c);save();d.remove();clientsModal()};
d.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>{selectedOffer.clientId=b.dataset.client;d.remove();newOffer()});
}
function cyc(){
let d=modal(`<h2>💳 Solicitud Crédito y Caución</h2><div class="muted">Plantilla: Solicitud Clasificaciones</div>
<div class="field"><label>Cliente</label><select id="cycClient"><option value="">Selecciona cliente</option>${state.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
<div class="grid">
${[['amount','Importe solicitado'],['nif','NIF'],['phone','Teléfono del cliente/contacto'],['fiscal','Nombre fiscal'],['commercial','Nombre comercial'],['address','Domicilio'],['city','Localidad'],['province','Provincia'],['postal','Código postal']].map(([k,l])=>`<div class="field"><label>${l}</label><input id="cyc_${k}"></div>`).join('')}</div>
<div class="notice">Asunto: <b>Alta de cliente C y C</b></div><div class="row section"><button class="btn" id="genCyc">Generar Excel</button><button class="btn secondary" id="close">Cerrar</button></div><div id="cycStatus"></div>`);
d.querySelector('#close').onclick=()=>d.remove();
d.querySelector('#cycClient').onchange=e=>{let c=state.clients.find(x=>x.id===e.target.value);if(c)for(let k of ['nif','phone','fiscal','commercial','address','city','province','postal'])d.querySelector('#cyc_'+k).value=c[k]||''};
d.querySelector('#genCyc').onclick=()=>generateCyc(d);
}
async function getTemplate(){
const r=await fetch('./assets/plantilla-cyc.xlsx');return new Uint8Array(await r.arrayBuffer())
}
async function generateCyc(d){
let v={};['amount','nif','phone','fiscal','commercial','address','city','province','postal'].forEach(k=>v[k]=d.querySelector('#cyc_'+k).value.trim());
if(Object.values(v).some(x=>!x)){toast('Completa todos los campos');return}
let wb=XLSX.read(await getTemplate(),{type:'array'});
let ws=wb.Sheets[wb.SheetNames[0]];
// Preserve template, fill adjacent cells to labels.
const map={D6:v.amount,D8:v.nif,G8:v.phone,D10:v.fiscal,D12:v.commercial,D14:v.address,D16:v.city,D18:v.province,G18:v.postal};
Object.entries(map).forEach(([cell,val])=>ws[cell]={t:'s',v:val});
let out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
let blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
let filename=`Alta_CYC_${v.commercial.replace(/[^a-z0-9áéíóúüñ_-]+/gi,'_')}.xlsx`;
state.cycRequests.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),client:v.commercial,...v,filename});
save();
d.querySelector('#cycStatus').innerHTML=`<div class="card section"><b>Excel generado</b><div class="muted">${esc(filename)}</div><div class="row section"><button class="btn" id="download">Guardar/Descargar</button><button class="btn gold" id="share">Compartir Excel</button><button class="btn secondary" id="email">Preparar email</button></div></div>`;
d.querySelector('#download').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click()};
d.querySelector('#share').onclick=async()=>{let f=new File([blob],filename,{type:blob.type});if(navigator.share){try{await navigator.share({title:'Alta de cliente C y C',text:'Alta de cliente C y C',files:[f]})}catch(e){}}else{toast('Tu navegador no permite compartir archivos; descarga el Excel.')}}
d.querySelector('#email').onclick=()=>{let to=state.settings.cycEmail||'';let body=`Buenos días,\n\nAdjunto solicitud de alta de cliente C y C.\n\nCliente: ${v.commercial}\nContacto: ${v.phone}\n\nSaludos,\n${state.settings.sender}`;location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent('Alta de cliente C y C')}&body=${encodeURIComponent(body)}`;toast('Se ha preparado el email; adjunta el Excel descargado.')};
}
function newOffer(){
let d=modal(`<h2>🧾 Crear listado</h2><div class="notice">Regla: Fresco solo o Fresco + <b>un único</b> congelado. Nunca se mezclan dos congelados.</div>
<div class="field"><label>Cliente</label><select id="ofClient"><option value="">Sin cliente</option>${state.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
<div class="field"><label>Tarifa</label><select id="ofFrozen"><option value="none">Solo Fresco</option>${['X','XY','Z','W'].map(k=>`<option value="${k}">Fresco + ${k}</option>`).join('')}</select></div>
<div id="pick"></div><div class="row section"><button class="btn" id="make">Generar listado</button><button class="btn secondary" id="cancel">Cerrar</button></div>`);
d.querySelector('#ofClient').value=selectedOffer.clientId||'';
d.querySelector('#ofFrozen').onchange=()=>pickProducts(d);
pickProducts(d);d.querySelector('#cancel').onclick=()=>d.remove();d.querySelector('#make').onclick=()=>makeOffer(d);
}
function pickProducts(d){
let fk=d.querySelector('#ofFrozen').value;let tariffs=fk==='none'?['Fresco']:['Fresco',fk];
let arr=state.products.filter(p=>tariffs.includes(p.tariff)&&p.stock!==false);
d.querySelector('#pick').innerHTML=`<div class="field"><input id="ofSearch" placeholder="Buscar producto..."></div><div class="card" id="pickRows">${arr.slice(0,120).map(p=>`<label style="display:flex;gap:9px;padding:9px 0;border-bottom:1px solid #eee"><input class="check" type="checkbox" value="${p.id}"><span><b>${esc(p.name)}</b><span class="muted"> · ${esc(p.code)} · ${money(p.price)} ${esc(p.unit||'')}</span></span></label>`).join('')||'<div class="empty">Carga productos primero.</div>'}</div>`;
}
function makeOffer(d){
let client=state.clients.find(c=>c.id===d.querySelector('#ofClient').value);let fk=d.querySelector('#ofFrozen').value;let tariffs=fk==='none'?['Fresco']:['Fresco',fk];
let ids=[...d.querySelectorAll('#pickRows input:checked')].map(x=>x.value);let items=state.products.filter(p=>ids.includes(p.id)).map(p=>({...p,finalPrice:p.price>19.99?p.price*.97:p.price}));
if(!items.length){toast('Selecciona al menos un producto');return}
let o={id:crypto.randomUUID(),createdAt:new Date().toISOString(),clientName:client?.name||'',tariffs,items};state.offers.push(o);save();d.remove();viewOffer(o);}

function viewOffer(o){
let d=modal(`<div class="row" style="justify-content:space-between"><h2>Listado de precios</h2><button class="btn secondary" id="close">Cerrar</button></div>
<div class="card">${o.clientName?`<b>${esc(o.clientName)}</b>`:''}<div class="muted">Tarifa: ${esc(o.tariffs.join(' + '))}</div><div class="muted">Generado: ${fmtDate(o.createdAt)}</div></div>
<table class="table section"><thead><tr><th>Producto</th><th>Precio final</th></tr></thead><tbody>${o.items.map(p=>`<tr><td>${esc(p.code)} · ${esc(p.name)}<div class="muted">${esc(p.format||'')}</div></td><td class="price">${money(p.finalPrice)} ${esc(p.unit||'')}</td></tr>`).join('')}</tbody></table>
<div class="row section"><button class="btn gold" id="shareText">Compartir WhatsApp</button><button class="btn secondary" id="copy">Copiar texto</button></div>`);
d.querySelector('#close').onclick=()=>d.remove();
let text=`${o.clientName?o.clientName+'\\n\\n':''}LISTADO DE PRECIOS\\n${o.tariffs.join(' + ')}\\n\\n`+o.items.map(p=>`${p.code} - ${p.name}: ${money(p.finalPrice)} ${p.unit||''}`).join('\\n');
d.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(text);toast('Texto copiado')};
d.querySelector('#shareText').onclick=async()=>{if(navigator.share)await navigator.share({text});else{await navigator.clipboard.writeText(text);location.href='https://wa.me/?text='+encodeURIComponent(text)}};
}
function uploadTariff(kind){
let inp=document.createElement('input');inp.type='file';inp.accept='.pdf';inp.onchange=async()=>{let f=inp.files[0];if(!f)return;state.tariffs[kind]={filename:f.name,loadedAt:new Date().toISOString()};save();toast(`${kind} cargada`);render()};inp.click();
}
function importDemo(){
const sample=[
['10001','Merluza','Fresco',12.5,'€/kg'],['10002','Salmón','Fresco',22.9,'€/kg'],['10003','Gamba','Fresco',18.9,'€/kg'],
['X100','Calamar congelado','X',21.5,'€/kg'],['X101','Bacalao congelado','X',15.9,'€/kg'],
['XY100','Langostino','XY',24.0,'€/kg'],['Z100','Pulpo','Z',19.5,'€/kg'],['W100','Sepia','W',17.5,'€/kg']];
state.products=sample.map(([code,name,tariff,price,unit])=>({id:crypto.randomUUID(),code,name,tariff,price,unit,format:'Caja',stock:true}));
save();toast('Ejemplo importado');render()
}
function stock(){
let d=modal(`<h2>🔴 Roturas de stock</h2><div class="muted">Los artículos no se eliminan: quedan bloqueados para nuevos listados.</div><div class="field"><input id="scode" placeholder="Código del producto"></div><div class="field"><input id="altcode" placeholder="Código alternativo (opcional)"></div><button class="btn danger" id="mark">Marcar sin stock</button><div class="section">${state.products.filter(p=>p.stock===false).map(p=>`<div class="card section"><b>${esc(p.code)} · ${esc(p.name)}</b><button class="btn secondary" data-react="${p.id}">Reactivar</button></div>`).join('')}</div>`);
d.querySelector('#mark').onclick=()=>{let p=state.products.find(x=>x.code===d.querySelector('#scode').value.trim());if(!p){toast('Código no encontrado');return}p.stock=false;state.stockouts.push({productId:p.id,alternative:d.querySelector('#altcode').value.trim(),date:new Date().toISOString()});save();d.remove();stock()};
d.querySelectorAll('[data-react]').forEach(b=>b.onclick=()=>{let p=state.products.find(x=>x.id===b.dataset.react);p.stock=true;save();d.remove();stock()});
}
function modules(){
let d=modal(`<h2>📦 Mis paquetes</h2><div class="muted">Los módulos desactivados desaparecen de la interfaz; sus datos se conservan.</div>
${[['map','🗺️ Prospección geográfica'],['cyc','💳 Crédito y Caución'],['routes','🧭 Rutas comerciales']].map(([k,l])=>`<div class="card section row" style="justify-content:space-between"><b>${l}</b><label><input type="checkbox" data-mod="${k}" ${state.modules[k]?'checked':''}> Activado</label></div>`).join('')}`);
d.querySelectorAll('[data-mod]').forEach(x=>x.onchange=()=>{state.modules[x.dataset.mod]=x.checked;save();toast('Módulo actualizado');render();d.remove()});
}
function settings(){
let d=modal(`<h2>⚙️ Ajustes</h2><div class="field"><label>Identidad comercial</label><input id="sender" value="${esc(state.settings.sender)}"></div><div class="field"><label>Empresa</label><input id="company" value="${esc(state.settings.company)}"></div><div class="field"><label>Email de Crédito y Caución</label><input id="cycemail" type="email" value="${esc(state.settings.cycEmail)}"></div><button class="btn" id="saveSet">Guardar</button>`);
d.querySelector('#saveSet').onclick=()=>{state.settings.sender=d.querySelector('#sender').value;state.settings.company=d.querySelector('#company').value;state.settings.cycEmail=d.querySelector('#cycemail').value;save();d.remove();render();toast('Ajustes guardados')};
}
function bind(){
document.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>go(x.dataset.go));
document.querySelectorAll('[data-upload]').forEach(x=>x.onclick=()=>uploadTariff(x.dataset.upload));
document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{tariffFilter=x.dataset.filter;render()});
document.querySelectorAll('[data-action="new-offer"]').forEach(x=>x.onclick=newOffer);
document.querySelectorAll('[data-action="cyc"]').forEach(x=>x.onclick=cyc);
document.querySelectorAll('[data-action="clients"]').forEach(x=>x.onclick=clientsModal);
document.querySelectorAll('[data-action="stock"]').forEach(x=>x.onclick=stock);
document.querySelectorAll('[data-action="modules"]').forEach(x=>x.onclick=modules);
document.querySelectorAll('[data-action="settings"]').forEach(x=>x.onclick=settings);
document.querySelector('[data-action="upload-tariff"]')?.addEventListener('click',()=>uploadTariff('Fresco'));
document.querySelector('[data-action="import-demo"]')?.addEventListener('click',importDemo);
document.querySelectorAll('[data-offer]').forEach(x=>x.onclick=()=>viewOffer(state.offers.find(o=>o.id===x.dataset.offer)));
document.querySelector('#productSearch')?.addEventListener('input',e=>{let q=e.target.value.toLowerCase();let arr=state.products.filter(p=>(tariffFilter==='all'||p.tariff===tariffFilter)&&(p.code+' '+p.name).toLowerCase().includes(q));document.querySelector('#prodRows').innerHTML=rows(arr)});
}
init();
