import {json,label,requireAdmin,ORDER_STAGES,audit,completedPurchases,origin,errorResponse} from '../../_lib.js';
import {sendStatusEmail} from '../../_email.js';
const allowed=new Set(ORDER_STAGES.map(([key])=>key));

export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env);
    const r=await env.DB.prepare(`SELECT o.*,p.amount_cents,p.status payment_status,p.reported_at,p.confirmed_at,
      (SELECT COUNT(*) FROM orders x WHERE lower(x.customer_email)=lower(o.customer_email) AND x.status='closed') completed_purchases,
      EXISTS(SELECT 1 FROM blacklist b WHERE lower(b.email)=lower(o.customer_email)) blacklisted
      FROM orders o
      LEFT JOIN payments p ON p.order_id=o.id
      LEFT JOIN order_archive a ON a.order_id=o.id
      WHERE a.order_id IS NULL
      ORDER BY CASE WHEN o.status='closed' THEN 1 ELSE 0 END, o.id DESC`).all();
    return json({orders:r.results.map(x=>({...x,status_label:label(x.status),loyal:Number(x.completed_purchases)>=5}))});
  }catch(e){return errorResponse(e)||json({error:'Impossible de charger les commandes.'},500)}
}

export async function onRequestPatch({request,env}){
  try{
    const admin=await requireAdmin(request,env),d=await request.json();
    const id=Number(d.id);
    if(!id||!allowed.has(d.status))return json({error:'Étape non valide.'},400);
    const current=await env.DB.prepare('SELECT id,customer_email,product,status FROM orders WHERE id=?').bind(id).first();
    if(!current)return json({error:'Commande introuvable.'},404);
    if(current.status===d.status)return json({ok:true,unchanged:true,email_sent:false});
    await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.status,id).run();
    await audit(env,{email:current.customer_email,orderId:id,action:'status_changed',details:`${label(current.status)} → ${label(d.status)}`,actor:admin.email});
    const payment=await env.DB.prepare('SELECT amount_cents,status payment_status FROM payments WHERE order_id=?').bind(id).first();
    const order={...current,...payment,status:d.status};
    const email=await sendStatusEmail(env,order,d.status,origin(request));
    const completed=await completedPurchases(env,current.customer_email);
    return json({ok:true,status_label:label(d.status),email_sent:!!email.sent,email_warning:email.sent?null:email.error||null,completed_purchases:completed,loyal:completed>=5});
  }catch(e){return errorResponse(e)||json({error:'Impossible de mettre à jour la commande.'},500)}
}

export async function onRequestPost({request,env}){
  try{
    const admin=await requireAdmin(request,env),d=await request.json(),id=Number(d.id);
    if(!id)return json({error:'Commande introuvable.'},400);
    const order=await env.DB.prepare('SELECT id,customer_email,status FROM orders WHERE id=?').bind(id).first();
    if(!order)return json({error:'Commande introuvable.'},404);
    if(order.status!=='closed')return json({error:'La commande doit être « Terminée » avant d’être archivée.'},400);
    await env.DB.prepare('INSERT OR IGNORE INTO order_archive(order_id,archived_by) VALUES(?,?)').bind(id,admin.email).run();
    await audit(env,{email:order.customer_email,orderId:id,action:'order_archived',details:'Commande archivée depuis l’administration',actor:admin.email});
    return json({ok:true});
  }catch(e){return errorResponse(e)||json({error:'Impossible d’archiver la commande.'},500)}
}
