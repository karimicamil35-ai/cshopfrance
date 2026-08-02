const STATUS={new:'Demande reçue',product_to_pay:'Produit à payer',product_paid:'Produit payé',shipping_to_pay:'Livraison à payer',shipped:'Colis expédié',receipt_confirmation:'Réception à confirmer',closed:'Terminée'};
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8'}})}
export function cookie(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
export function readCookie(request,name){const v=request.headers.get('cookie')||'';return v.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
export function session(request){const raw=readCookie(request,'cshop_session');if(!raw)return null;try{return JSON.parse(atob(raw))}catch{return null}}
export function user(request,env){const u=session(request);if(!u)return null;return {...u,admin:(env.ADMIN_EMAIL||'').toLowerCase()===u.email.toLowerCase()}}
export function requireUser(request,env){const u=user(request,env);if(!u)throw new Error('UNAUTHENTICATED');return u}
export function label(status){return STATUS[status]||STATUS.new}
export function origin(request){return new URL(request.url).origin}
