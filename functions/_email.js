import {euro,label} from './_lib.js';

const COPY={
  new:{subject:'Nous avons bien reçu ta demande',title:'Demande reçue',text:'Ta demande est bien enregistrée. Nous allons maintenant regarder précisément ce que tu recherches avant de commencer la recherche.'},
  searching:{subject:'Nous recherchons ton produit',title:'Recherche en cours',text:'La recherche de ton produit a commencé. Nous vérifions les options qui correspondent à ta demande, ta taille, tes préférences et ton budget.'},
  proposal:{subject:'Ta proposition C-Shop.fr est disponible',title:'Proposition disponible',text:'Une proposition est prête pour ta commande. Connecte-toi à ton espace C-Shop.fr pour consulter le montant, le paiement et échanger avec nous si nécessaire.'},
  ordered:{subject:'Ta commande est validée',title:'Commande validée',text:'Ton achat est maintenant validé. Nous poursuivons le traitement de ta commande et nous te préviendrons dès qu’elle sera expédiée.'},
  shipped:{subject:'Ta commande a été expédiée',title:'Commande expédiée',text:'Bonne nouvelle : ta commande a été expédiée. Tu peux suivre son avancement directement depuis ton espace C-Shop.fr.'},
  delivered:{subject:'Ta commande est indiquée comme livrée',title:'Commande livrée',text:'Ta commande est maintenant indiquée comme livrée. Vérifie que tout est conforme et n’hésite pas à laisser ton avis depuis ton espace client.'},
  closed:{subject:'Merci pour ta commande C-Shop.fr',title:'Commande terminée',text:'Ta commande est terminée. Merci d’avoir utilisé C-Shop.fr. Cet achat est ajouté automatiquement à ton historique et compte pour ton statut Client fidèle.'},
};

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function baseHtml({title,text,order,siteUrl,extra=''}){
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#080908;color:#f7f4f1;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="font-size:22px;font-weight:800;margin-bottom:28px"><span style="display:inline-block;background:#ff5a0a;color:#111;padding:4px 8px;border-radius:5px">C</span> SHOP<span style="color:#ff5a0a">.FR</span></div><div style="border:1px solid #3b281f;background:#101210;border-radius:14px;padding:28px"><div style="color:#ff7b38;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Commande #CSP-${esc(order.id)}</div><h1 style="font-size:28px;line-height:1.1;margin:12px 0 16px;color:#fff">${esc(title)}</h1><p style="color:#b8bbb7;line-height:1.7;font-size:15px">${esc(text)}</p>${extra}<div style="margin-top:24px;padding:14px 16px;border-left:3px solid #ff5a0a;background:#17110e;color:#d6d5d2"><strong>Étape actuelle :</strong> ${esc(label(order.status))}</div><a href="${esc(siteUrl)}?page=suivi" style="display:inline-block;margin-top:25px;background:#ff5a0a;color:#111;text-decoration:none;font-weight:800;padding:13px 18px;border-radius:7px">Voir ma commande →</a></div><p style="color:#6f746f;font-size:11px;line-height:1.6;margin-top:20px">Cet e-mail concerne ta commande C-Shop.fr. Tu peux retrouver les échanges et le suivi depuis ton espace client.</p></div></body></html>`;
}

async function logEmail(env,{orderId,email,type,subject,success,providerId='',error=''}){
  try{await env.DB.prepare('INSERT INTO email_notifications(order_id,customer_email,notification_type,subject,provider_id,success,error_text) VALUES(?,?,?,?,?,?,?)').bind(orderId,email,type,subject,providerId,success?1:0,String(error||'').slice(0,900)).run();}catch{}
}

function bytesToBase64Url(bytes){
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function utf8Base64(value){
  const bytes=new TextEncoder().encode(String(value??''));
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return btoa(binary);
}

function encodeHeader(value){
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

async function getGmailAccessToken(env){
  if(!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET||!env.GMAIL_REFRESH_TOKEN){
    throw new Error('Gmail non configuré : ajoute GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN.');
  }
  const body=new URLSearchParams({
    client_id:env.GMAIL_CLIENT_ID,
    client_secret:env.GMAIL_CLIENT_SECRET,
    refresh_token:env.GMAIL_REFRESH_TOKEN,
    grant_type:'refresh_token',
  });
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:body.toString(),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    throw new Error(data?.error_description||data?.error||`Google OAuth HTTP ${response.status}`);
  }
  return data.access_token;
}

function buildRawMessage({from,to,subject,html}){
  const mime=[
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
  ].join('\r\n');
  return bytesToBase64Url(new TextEncoder().encode(mime));
}

export async function sendEmail(env,{to,subject,html,orderId,type}){
  if(!env.EMAIL_FROM||!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET||!env.GMAIL_REFRESH_TOKEN){
    const error='E-mail non configuré : ajoute EMAIL_FROM, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN.';
    await logEmail(env,{orderId,email:to,type,subject,success:false,error});
    return {sent:false,error,configurationMissing:true};
  }
  try{
    const accessToken=await getGmailAccessToken(env);
    const raw=buildRawMessage({from:env.EMAIL_FROM,to,subject,html});
    const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'authorization':`Bearer ${accessToken}`,
      },
      body:JSON.stringify({raw}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error?.message||`Gmail API HTTP ${response.status}`);
    await logEmail(env,{orderId,email:to,type,subject,success:true,providerId:data?.id||''});
    return {sent:true,id:data?.id||null};
  }catch(error){
    await logEmail(env,{orderId,email:to,type,subject,success:false,error:error.message});
    return {sent:false,error:error.message};
  }
}

export async function sendStatusEmail(env,order,status,siteUrl){
  const copy=COPY[status];
  if(!copy)return {sent:false,skipped:true};
  const payment=euro(order.amount_cents);
  const extra=status==='proposal'&&payment?`<div style="margin:22px 0 0;padding:18px;border:1px solid #51301e;border-radius:9px;background:#17110e"><span style="display:block;color:#8d918d;font-size:12px">Montant proposé</span><strong style="display:block;color:#ff7b38;font-size:25px;margin-top:5px">${esc(payment)}</strong><span style="display:block;color:#aaa;font-size:12px;margin-top:8px">Les informations de paiement sont disponibles dans ton espace client.</span></div>`:'';
  const normalized={...order,status};
  return sendEmail(env,{to:order.customer_email,subject:`C-Shop.fr — ${copy.subject}`,html:baseHtml({title:copy.title,text:copy.text,order:normalized,siteUrl,extra}),orderId:order.id,type:`status:${status}`});
}

export async function sendPaymentConfirmedEmail(env,order,siteUrl){
  const amount=euro(order.amount_cents);
  const subject='C-Shop.fr — Paiement confirmé';
  const extra=amount?`<div style="margin:22px 0 0;padding:18px;border:1px solid #35552c;border-radius:9px;background:#101710"><span style="display:block;color:#9fa79b;font-size:12px">Paiement confirmé</span><strong style="display:block;color:#86d66b;font-size:24px;margin-top:5px">${esc(amount)}</strong></div>`:'';
  return sendEmail(env,{to:order.customer_email,subject,html:baseHtml({title:'Paiement confirmé ✓',text:'Nous avons vérifié ton paiement. Il est maintenant confirmé dans ton espace C-Shop.fr.',order,siteUrl,extra}),orderId:order.id,type:'payment:confirmed'});
}
