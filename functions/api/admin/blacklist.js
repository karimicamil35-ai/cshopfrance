import {json,requireAdmin,normalizeEmail,clean,audit,errorResponse} from '../../_lib.js';
const validEmail=email=>/^\S+@\S+\.\S+$/.test(email);
export async function onRequestGet({request,env}){
  try{await requireAdmin(request,env);const rows=await env.DB.prepare('SELECT email,reason,note,created_by,created_at FROM blacklist ORDER BY created_at DESC').all();return json({blacklist:rows.results});}
  catch(e){return errorResponse(e)||json({error:'Impossible de charger la blacklist.'},500)}
}
export async function onRequestPost({request,env}){
  try{
    const admin=await requireAdmin(request,env),d=await request.json(),email=normalizeEmail(d.email),action=d.action||'blacklist';
    if(!validEmail(email))return json({error:'Adresse e-mail invalide.'},400);
    if(action==='unblacklist'){
      await env.DB.prepare('DELETE FROM blacklist WHERE lower(email)=lower(?)').bind(email).run();
      await audit(env,{email,action:'unblacklisted',details:'Retiré de la blacklist',actor:admin.email});
      return json({ok:true,blacklisted:false});
    }
    const reason=clean(d.reason)||'Non précisée',note=clean(d.note);
    await env.DB.prepare(`INSERT INTO blacklist(email,reason,note,created_by,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,created_at=CURRENT_TIMESTAMP`).bind(email,reason,note,admin.email).run();
    await audit(env,{email,action:'blacklisted',details:[reason,note].filter(Boolean).join(' — '),actor:admin.email});
    return json({ok:true,blacklisted:true});
  }catch(e){return errorResponse(e)||json({error:'Impossible de modifier la blacklist.'},500)}
}
