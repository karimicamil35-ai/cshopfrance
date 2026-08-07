import {json,label,requireUser,clean,isBlacklisted,upsertClient,audit,completedPurchases,origin} from '../../_lib.js';
import {sendStatusEmail} from '../../_email.js';

const list=v=>Array.isArray(v)?v.map(a=>({product:clean(a?.product),size:clean(a?.size),budget:clean(a?.budget),details:[clean(a?.colors)&&`Couleurs souhaitées : ${clean(a.colors)}`,clean(a?.details||a?.remarks)&&`Remarques : ${clean(a.details||a.remarks)}`].filter(Boolean).join('\n')})).filter(a=>a.product):[];
const summary=(a,key,fallback='')=>a.map((x,i)=>`${i+1}. ${x[key]||fallback}`).join('\n');

export async function onRequestGet({request,env}){
  try{
    const u=await requireUser(request,env);
    const r=await env.DB.prepare(`SELECT o.id,o.product,o.size,o.budget,o.details,o.status,o.created_at,o.updated_at,o.review_rating,o.review_comment,
      p.amount_cents,p.status payment_status,p.reported_at,p.confirmed_at
      FROM orders o LEFT JOIN payments p ON p.order_id=o.id
      WHERE lower(o.customer_email)=lower(?) ORDER BY o.id DESC LIMIT 50`).bind(u.email).all();
    const completed=await completedPurchases(env,u.email);
    const blacklisted=await isBlacklisted(env,u.email);
    return json({orders:r.results.map(x=>({...x,status_label:label(x.status)})),customer:{email:u.email,completed_purchases:completed,loyal:completed>=5,blacklisted},paypal_email:env.PAYPAL_EMAIL||'camilk355@gmail.com'});
  }catch(error){return json({error:'Connexion Google nécessaire'},401)}
}

export async function onRequestPost({request,env}){
  try{
    const u=await requireUser(request,env);
    if(await isBlacklisted(env,u.email))return json({error:'Ce compte ne peut actuellement pas effectuer de nouvelle demande.'},403);
    await upsertClient(env,u.email,u.name);
    const d=await request.json(),articles=list(d.articles);
    if(!articles.length||articles.some(a=>!a.budget))return json({error:'Merci d’indiquer le produit recherché et le budget maximum.'},400);
    const active=await env.DB.prepare("SELECT id FROM orders WHERE lower(customer_email)=lower(?) AND status NOT IN ('closed','archived') LIMIT 1").bind(u.email).first();
    if(active)return json({error:'Tu as déjà une commande en cours. Attends qu’elle soit terminée avant d’en créer une nouvelle.'},409);
    const products=summary(articles,'product'),sizes=summary(articles,'size','Sans taille'),budgets=summary(articles,'budget'),details=summary(articles,'details','Aucune précision ajoutée');
    const r=await env.DB.prepare("INSERT INTO orders (customer_email,first_name,last_name,phone,city,product,size,budget,details,status) VALUES (?,?,?,?,?,?,?,?,?,'new')").bind(u.email,clean(u.name)||'Client','C SHOP.FR','Non indiqué','Non indiqué',products,sizes,budgets,details).run();
    const id=r.meta.last_row_id;
    await audit(env,{email:u.email,orderId:id,action:'order_created',details:products,actor:u.email});
    const order={id,customer_email:u.email,product:products,status:'new'};
    const email=await sendStatusEmail(env,order,'new',origin(request));
    return json({ok:true,id,email_sent:!!email.sent,email_warning:email.sent?null:email.error||null},201);
  }catch(e){return json({error:e.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':'Impossible d’enregistrer la demande.'},e.message==='UNAUTHENTICATED'?401:500)}
}
