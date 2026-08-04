import {requireUser} from '../../../../_lib.js';

export async function onRequestGet({request,env,params}){
  try{
    const user=await requireUser(request,env);
    const order=user.admin
      ? await env.DB.prepare("SELECT id FROM orders WHERE id=? AND status != 'archived'").bind(params.id).first()
      : await env.DB.prepare("SELECT id FROM orders WHERE id=? AND customer_email=? AND status != 'archived'").bind(params.id,user.email).first();
    if(!order)return new Response('Commande introuvable.',{status:404});
    const file=await env.DB.prepare('SELECT file_name,content_type,data FROM order_message_files WHERE id=? AND order_id=?').bind(params.fileId,order.id).first();
    if(!file)return new Response('Fichier introuvable.',{status:404});
    const safeName=String(file.file_name).replace(/["\\\r\n]/g,'_');
    return new Response(file.data,{headers:{'content-type':file.content_type||'application/octet-stream','content-disposition':`attachment; filename="${safeName}"`,'x-content-type-options':'nosniff'}});
  }catch(error){return new Response('Connexion Google nécessaire.',{status:401});}
}
