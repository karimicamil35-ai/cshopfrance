import {json,requireAdmin,parseAmount,audit,origin,errorResponse} from '../../_lib.js';
import {sendPaymentConfirmedEmail} from '../../_email.js';
const statuses=new Set(['pending','reported','confirmed']);
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env);
    const rows=await env.DB.prepare(`SELECT o.id order_id,o.customer_email,o.product,o.status order_status,o.created_at,
      p.amount_cents,p.status payment_status,p.reported_at,p.confirmed_at,p.updated_at
      FROM orders o LEFT JOIN payments p ON p.order_id=o.id
      ORDER BY CASE WHEN p.status='reported' THEN 0 WHEN p.status='pending' THEN 1 WHEN p.status='confirmed' THEN 2 ELSE 3 END,o.id DESC LIMIT 250`).all();
    return json({payments:rows.results});
  }catch(e){return errorResponse(e)||json({error:'Impossible de charger les paiements.'},500)}
}
export async function onRequestPatch({request,env}){
  try{
    const admin=await requireAdmin(request,env),d=await request.json(),orderId=Number(d.order_id);
    if(!orderId)return json({error:'Commande introuvable.'},400);
    const order=await env.DB.prepare('SELECT id,customer_email,product,status FROM orders WHERE id=?').bind(orderId).first();
    if(!order)return json({error:'Commande introuvable.'},404);
    const current=await env.DB.prepare('SELECT * FROM payments WHERE order_id=?').bind(orderId).first();
    if(d.action==='set_price'){
      if(current?.status==='confirmed')return json({error:'Le paiement est déjà confirmé. Remets-le en attente avant de modifier le prix.'},409);
      const amount=parseAmount(d.amount);
      if(!amount)return json({error:'Entre un prix valide, par exemple 49,99.'},400);
      await env.DB.prepare(`INSERT INTO payments(order_id,amount_cents,status,created_at,updated_at) VALUES(?,?,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(order_id) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=CURRENT_TIMESTAMP`).bind(orderId,amount).run();
      await audit(env,{email:order.customer_email,orderId,action:'price_set',details:`Prix défini : ${(amount/100).toFixed(2)} €`,actor:admin.email});
      return json({ok:true,amount_cents:amount});
    }
    if(d.action==='set_status'){
      const status=String(d.status||'');
      if(!statuses.has(status))return json({error:'Statut de paiement invalide.'},400);
      const payment=current||await env.DB.prepare("SELECT * FROM payments WHERE order_id=?").bind(orderId).first();
      if(!payment?.amount_cents)return json({error:'Définis d’abord le prix.'},400);
      await env.DB.prepare(`UPDATE payments SET status=?,reported_at=CASE WHEN ?='reported' THEN CURRENT_TIMESTAMP ELSE reported_at END,
        confirmed_at=CASE WHEN ?='confirmed' THEN CURRENT_TIMESTAMP WHEN ?!='confirmed' THEN NULL ELSE confirmed_at END,updated_at=CURRENT_TIMESTAMP WHERE order_id=?`).bind(status,status,status,status,orderId).run();
      await audit(env,{email:order.customer_email,orderId,action:'payment_status',details:`Paiement : ${status}`,actor:admin.email});
      let email={sent:false,skipped:true};
      if(status==='confirmed')email=await sendPaymentConfirmedEmail(env,{...order,amount_cents:payment.amount_cents},origin(request));
      return json({ok:true,status,email_sent:!!email.sent,email_warning:email.sent?null:email.error||null});
    }
    return json({error:'Action de paiement inconnue.'},400);
  }catch(e){return errorResponse(e)||json({error:'Impossible de modifier le paiement.'},500)}
}
