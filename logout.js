const STATUS={new:'Demande reçue',product_to_pay:'Produit à payer',product_paid:'Produit payé',shipping_to_pay:'Produit payé',shipped:'Colis expédié',receipt_confirmation:'Réception à confirmer',closed:'Terminée',archived:'Terminée'};
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
export function label(status){return STATUS[status]||STATUS.new}
export function origin(request){return new URL(request.url).origin}
