import {json,requireAdmin,normalizeEmail,label,errorResponse} from '../../_lib.js';
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env);
    const email=normalizeEmail(new URL(request.url).searchParams.get('email'));
    if(!email)return json({error:'Entre le Gmail du client.'},400);
    const client=await env.DB.prepare('SELECT email,name,first_seen_at,last_seen_at FROM clients WHERE lower(email)=lower(?)').bind(email).first();
    const blacklist=await env.DB.prepare('SELECT email,reason,note,created_by,created_at FROM blacklist WHERE lower(email)=lower(?)').bind(email).first();
    const orders=await env.DB.prepare(`SELECT o.id,o.product,o.size,o.budget,o.details,o.status,o.created_at,o.updated_at,o.review_rating,o.review_comment,o.reviewed_at,
      p.amount_cents,p.status payment_status,p.reported_at,p.confirmed_at
      FROM orders o LEFT JOIN payments p ON p.order_id=o.id
      WHERE lower(o.customer_email)=lower(?) ORDER BY o.id DESC LIMIT 100`).bind(email).all();
    const logs=await env.DB.prepare('SELECT id,order_id,action,details,actor_email,created_at FROM audit_log WHERE lower(customer_email)=lower(?) ORDER BY id DESC LIMIT 250').bind(email).all();
    const emails=await env.DB.prepare('SELECT order_id,notification_type,subject,success,error_text,created_at FROM email_notifications WHERE lower(customer_email)=lower(?) ORDER BY id DESC LIMIT 100').bind(email).all();
    const completed=orders.results.filter(o=>o.status==='closed').length;
    const totalPaid=orders.results.reduce((sum,o)=>sum+(o.payment_status==='confirmed'?Number(o.amount_cents||0):0),0);
    return json({client:client||{email,name:'Client'},blacklist:blacklist||null,stats:{orders:orders.results.length,completed_purchases:completed,loyal:completed>=5,total_paid_cents:totalPaid},orders:orders.results.map(o=>({...o,status_label:label(o.status)})),logs:logs.results,emails:emails.results});
  }catch(e){return errorResponse(e)||json({error:'Impossible de charger cet historique.'},500)}
}
