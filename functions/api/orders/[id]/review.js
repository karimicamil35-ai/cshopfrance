import {json,requireUser,audit} from '../../../_lib.js';
export async function onRequestPost({request,env,params}){
  try{
    const u=await requireUser(request,env),d=await request.json();
    const rating=Math.min(5,Math.max(1,Number(d.rating))),comment=String(d.comment||'').trim();
    if(!Number.isInteger(rating)||!comment)return json({error:'La note et l’avis sont obligatoires.'},400);
    const o=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND lower(customer_email)=lower(?)').bind(params.id,u.email).first();
    if(!o)return json({error:'Commande introuvable.'},404);
    if(!['delivered','closed'].includes(o.status))return json({error:'La commande doit d’abord être livrée.'},400);
    if(o.reviewed_at)return json({error:'Un avis a déjà été publié pour cette commande.'},409);
    await env.DB.prepare('UPDATE orders SET review_rating=?,review_comment=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').bind(rating,comment,params.id).run();
    await audit(env,{email:u.email,orderId:Number(params.id),action:'review_added',details:`${rating}/5 — ${comment}`,actor:u.email});
    if(env.DISCORD_SALES_WEBHOOK){const stars='★'.repeat(rating)+'☆'.repeat(5-rating);await fetch(env.DISCORD_SALES_WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({embeds:[{title:'Nouvelle vente C‑Shop',color:16737536,fields:[{name:'Produit',value:o.product},{name:'Avis client',value:`${stars}\n${comment}`}],footer:{text:'Publication anonyme'}}]})});}
    return json({ok:true});
  }catch(e){return json({error:e.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':'Impossible d’envoyer cet avis.'},e.message==='UNAUTHENTICATED'?401:500)}
}
