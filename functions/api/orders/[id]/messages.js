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
    const rows=await env.DB.prepare('SELECT id,order_id,author_email,author_role,message,created_at FROM order_messages WHERE order_id=? ORDER BY id ASC').bind(order.id).all();
    const files=await env.DB.prepare('SELECT id,message_id,file_name,content_type,size_bytes FROM order_message_files WHERE order_id=? ORDER BY id ASC').bind(order.id).all();
    const filesByMessage=new Map();
    for(const file of files.results){const list=filesByMessage.get(file.message_id)||[];list.push({id:file.id,file_name:file.file_name,content_type:file.content_type,size_bytes:file.size_bytes});filesByMessage.set(file.message_id,list);}
    return json({messages:rows.results.map(row=>({...row,files:filesByMessage.get(row.id)||[],mine:row.author_email.toLowerCase()===user.email.toLowerCase()}))});
  }catch(error){return json({error:error.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':error.message==='NOT_FOUND'?'Commande introuvable.':'Impossible de charger la discussion.'},error.message==='UNAUTHENTICATED'?401:error.message==='NOT_FOUND'?404:500);}
}

export async function onRequestPost({request,env,params}){
  try{
    const {user,order}=await orderForUser(request,env,params.id);
    const body=await request.json();
    const message=String(body.message||'').trim();
    const files=Array.isArray(body.files)?body.files:[];
    if(message.length>1200||(!message&&!files.length)||files.length>4)return json({error:'Ajoute un message ou jusqu’à 4 fichiers.'},400);
    const prepared=[];
    for(const file of files){
      const name=String(file?.name||'fichier').replace(/[\\/\x00-\x1f]/g,'_').slice(0,120);
      const match=String(file?.data||'').match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/);
      if(!match)return json({error:'Un fichier est invalide.'},400);
      const size=Math.floor(match[2].replace(/=+$/,'').length*3/4);
      if(size<1||size>8*1024*1024)return json({error:'Chaque fichier doit faire moins de 8 Mo.'},400);
      const binary=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));
      prepared.push({name,contentType:match[1].slice(0,100),size,data:binary});
    }
    const result=await env.DB.prepare('INSERT INTO order_messages (order_id,author_email,author_role,message) VALUES (?,?,?,?)').bind(order.id,user.email,user.admin?'admin':'customer',message).run();
    if(prepared.length)await env.DB.batch(prepared.map(file=>env.DB.prepare('INSERT INTO order_message_files (order_id,message_id,file_name,content_type,size_bytes,data) VALUES (?,?,?,?,?,?)').bind(order.id,result.meta.last_row_id,file.name,file.contentType,file.size,file.data)));
    return json({ok:true},201);
  }catch(error){return json({error:error.message==='UNAUTHENTICATED'?'Connexion Google nécessaire':error.message==='NOT_FOUND'?'Commande introuvable.':'Impossible d’envoyer le message.'},error.message==='UNAUTHENTICATED'?401:error.message==='NOT_FOUND'?404:500);}
}
