import {json,requireAdmin,errorResponse} from '../../_lib.js';
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env);
    const q=(new URL(request.url).searchParams.get('q')||'').trim().toLowerCase();
    const like=`%${q}%`;
    const result=await env.DB.prepare(`WITH emails AS (
      SELECT email FROM clients
      UNION
      SELECT customer_email AS email FROM orders
    )
    SELECT e.email,COALESCE(c.name,'Client') name,c.first_seen_at,c.last_seen_at,
      COUNT(o.id) total_orders,
      SUM(CASE WHEN o.status='closed' THEN 1 ELSE 0 END) completed_purchases,
      COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.amount_cents ELSE 0 END),0) total_paid_cents,
      MAX(o.created_at) last_order_at,
      CASE WHEN b.email IS NULL THEN 0 ELSE 1 END blacklisted
    FROM emails e
    LEFT JOIN clients c ON lower(c.email)=lower(e.email)
    LEFT JOIN orders o ON lower(o.customer_email)=lower(e.email)
    LEFT JOIN payments p ON p.order_id=o.id
    LEFT JOIN blacklist b ON lower(b.email)=lower(e.email)
    WHERE lower(e.email) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ?
    GROUP BY e.email,c.name,c.first_seen_at,c.last_seen_at,b.email
    ORDER BY completed_purchases DESC,last_order_at DESC,e.email ASC
    LIMIT 200`).bind(like,like).all();
    return json({clients:result.results.map(c=>({...c,total_orders:Number(c.total_orders||0),completed_purchases:Number(c.completed_purchases||0),total_paid_cents:Number(c.total_paid_cents||0),blacklisted:!!c.blacklisted,loyal:Number(c.completed_purchases||0)>=5}))});
  }catch(e){return errorResponse(e)||json({error:'Impossible de charger les clients.'},500)}
}
