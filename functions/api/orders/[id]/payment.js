import {json,requireUser,audit} from '../../../_lib.js';
export async function onRequestPost({request,env,params}){
  try{
    const u=await requireUser(request,env),id=Number(params.id);
    const order=await env.DB.prepare('SELECT id,customer_email,status FROM orders WHERE id=? AND lower(customer_email)=lower(?)').bind(id,u.email).first();
    if(!order)return json({error:'Commande introuvable.'},404);
    const payment=await env.DB.prepare('SELECT * FROM payments WHERE order_id=?').bind(id).first();
    if(!payment?.amount_cents)return json({error:'Le prix n’a pas encore été défini.'},400);
    if(payment.status==='confirmed')return json({ok:true,status:'confirmed'});
    await env.DB.prepare("UPDATE payments SET status='reported',reported_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(id).run();
    await audit(env,{email:u.email,orderId:id,action:'payment_reported',details:'Le client indique avoir effectué le paiement PayPal.',actor:u.email});
    return json({ok:true,status:'reported'});
  }catch(e){return json({error:e.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':'Impossible de signaler le paiement.'},e.message==='UNAUTHENTICATED'?401:500)}
}
