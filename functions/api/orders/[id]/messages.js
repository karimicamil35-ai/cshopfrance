import {json,requireUser} from '../../../_lib.js';

async function orderForUser(request,env,id){
  const user=await requireUser(request,env);
  const order=user.admin
    ? await env.DB.prepare("SELECT id, customer_email FROM orders WHERE id=? AND status != 'archived'").bind(id).first()
    : await env.DB.prepare("SELECT id, customer_email FROM orders WHERE id=? AND customer_email=? AND status != 'archived'").bind(id,user.email).first();
  if(!order)throw new Error('NOT_FOUND');
  return {user,order};
}

export async function onRequestGet({request,env,params}){
  try{
    const {user,order}=await orderForUser(request,env,params.id);
    const rows=await env.DB.prepare('SELECT author_email,author_role,message,created_at FROM order_messages WHERE order_id=? ORDER BY id ASC').bind(order.id).all();
    return json({messages:rows.results.map(row=>({...row,mine:row.author_email.toLowerCase()===user.email.toLowerCase()}))});
  }catch(error){return json({error:error.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':error.message==='NOT_FOUND'?'Commande introuvable.':'Impossible de charger la discussion.'},error.message==='UNAUTHENTICATED'?401:error.message==='NOT_FOUND'?404:500);}
}

export async function onRequestPost({request,env,params}){
  try{
    const {user,order}=await orderForUser(request,env,params.id);
    const message=String((await request.json()).message||'').trim();
    if(!message||message.length>1200)return json({error:'Le message doit contenir entre 1 et 1 200 caractères.'},400);
    await env.DB.prepare('INSERT INTO order_messages (order_id,author_email,author_role,message) VALUES (?,?,?,?)').bind(order.id,user.email,user.admin?'admin':'customer',message).run();
    return json({ok:true},201);
  }catch(error){return json({error:error.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':error.message==='NOT_FOUND'?'Commande introuvable.':'Impossible d’envoyer le message.'},error.message==='UNAUTHENTICATED'?401:error.message==='NOT_FOUND'?404:500);}
}
