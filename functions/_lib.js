export const ORDER_STAGES=[
  ['new','Demande reçue'],
  ['searching','Recherche en cours'],
  ['proposal','Proposition disponible'],
  ['ordered','Commandée'],
  ['shipped','Expédiée'],
  ['delivered','Livrée'],
  ['closed','Terminée'],
];
const STATUS=Object.fromEntries(ORDER_STAGES);
STATUS.archived='Terminée';
STATUS.product_to_pay='Proposition disponible';
STATUS.product_paid='Commandée';
STATUS.shipping_to_pay='Commandée';
STATUS.receipt_confirmation='Livrée';

export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8'}})}
export function cookie(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
export function readCookie(request,name){const v=request.headers.get('cookie')||'';return v.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
const enc=new TextEncoder();
const b64=v=>btoa(String.fromCharCode(...new Uint8Array(v))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-v.length%4)%4)),c=>c.charCodeAt(0));
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(value)))}
export async function makeSession(data,env){if(!env.SESSION_SECRET)throw new Error('SESSION_SECRET_MISSING');const payload=b64(enc.encode(JSON.stringify(data)));return `${payload}.${await sign(payload,env.SESSION_SECRET)}`}
export async function session(request,env){const raw=readCookie(request,'cshop_session');if(!raw||!env.SESSION_SECRET)return null;const [payload,signature]=raw.split('.');if(!payload||!signature||signature!==await sign(payload,env.SESSION_SECRET))return null;try{return JSON.parse(new TextDecoder().decode(unb64(payload)))}catch{return null}}
export async function user(request,env){const u=await session(request,env);if(!u)return null;return {...u,admin:(env.ADMIN_EMAIL||'').toLowerCase()===u.email.toLowerCase()}}
export async function requireUser(request,env){const u=await user(request,env);if(!u)throw new Error('UNAUTHENTICATED');return u}
export async function requireAdmin(request,env){const u=await requireUser(request,env);if(!u.admin)throw new Error('FORBIDDEN');return u}
export function label(status){return STATUS[status]||status||STATUS.new}
export function origin(request){return new URL(request.url).origin}
export const clean=v=>typeof v==='string'?v.trim():'';
export const normalizeEmail=v=>clean(v).toLowerCase();
export function euro(cents){return Number.isFinite(Number(cents))&&Number(cents)>0?(Number(cents)/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}):null}
export function parseAmount(value){
  if(typeof value==='number'&&Number.isFinite(value))return Math.round(value*100);
  const normalized=String(value??'').trim().replace(/\s/g,'').replace('€','').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return null;
  const amount=Math.round(Number(normalized)*100);
  return amount>0?amount:null;
}
export async function isBlacklisted(env,email){return !!await env.DB.prepare('SELECT 1 FROM blacklist WHERE lower(email)=lower(?)').bind(email).first()}
export async function upsertClient(env,email,name='Client'){
  await env.DB.prepare(`INSERT INTO clients(email,name,first_seen_at,last_seen_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,last_seen_at=CURRENT_TIMESTAMP`).bind(normalizeEmail(email),clean(name)||'Client').run();
}
export async function audit(env,{email,orderId=null,action,details='',actor=''}){
  await env.DB.prepare('INSERT INTO audit_log(customer_email,order_id,action,details,actor_email) VALUES(?,?,?,?,?)').bind(normalizeEmail(email),orderId,action,String(details||''),normalizeEmail(actor||'system')).run();
}
export async function completedPurchases(env,email){const r=await env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE lower(customer_email)=lower(?) AND status='closed'").bind(email).first();return Number(r?.n||0)}
export function errorResponse(error){
  if(error?.message==='UNAUTHENTICATED')return json({error:'Connexion Google nécessaire.'},401);
  if(error?.message==='FORBIDDEN')return json({error:'Accès administrateur refusé.'},403);
  return null;
}
