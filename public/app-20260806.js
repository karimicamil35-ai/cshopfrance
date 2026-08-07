const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const api = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Une erreur est survenue.'), { status: response.status });
  return body;
};
const money = cents => cents ? (Number(cents) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : 'Non défini';
const formatDate = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
let currentUser = null;
let paypalEmail = 'camilk355@gmail.com';
let adminState = { orders: [], clients: [], blacklist: [], payments: [] };

const splitOrderField = value => String(value || '').split('\n').map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
function articlesMarkup(order) {
  const products = splitOrderField(order.product), sizes = splitOrderField(order.size), budgets = splitOrderField(order.budget), details = splitOrderField(order.details);
  return `<div class="orderArticles">${products.map((product, index) => `<div class="orderArticle"><strong>Article ${index + 1}</strong><b>${escapeHtml(product)}</b><p><span>Taille</span>${escapeHtml(sizes[index] || 'Sans taille')} <i>·</i> <span>Budget</span>${escapeHtml(budgets[index] || 'Non indiqué')}</p>${details[index] && details[index] !== 'Aucune précision ajoutée' ? `<p class="articleDetails">${escapeHtml(details[index])}</p>` : ''}</div>`).join('')}</div>`;
}
function pageFromUrl() { const page = new URLSearchParams(location.search).get('page'); return ['demande','suivi','avis','administration'].includes(page) ? page : 'accueil'; }
function closeMenu() { document.body.classList.remove('menuOpen'); $('#menuToggle').setAttribute('aria-expanded','false'); $('#sideMenu').setAttribute('aria-hidden','true'); $('#menuOverlay').hidden = true; }
function openMenu() { document.body.classList.add('menuOpen'); $('#menuToggle').setAttribute('aria-expanded','true'); $('#sideMenu').setAttribute('aria-hidden','false'); $('#menuOverlay').hidden = false; }
function showPage(pageId, updateUrl = true) {
  const currentPage = ['demande','suivi','avis','administration'].includes(pageId) ? pageId : 'accueil';
  $$('.page').forEach(section => { const active = section.id === currentPage; section.classList.toggle('pageActive', active); section.hidden = !active; section.style.display = active ? (currentPage === 'demande' ? 'grid' : 'block') : 'none'; });
  $$('[data-nav-page]').forEach(link => link.classList.toggle('active', link.dataset.navPage === currentPage));
  if (updateUrl) history.replaceState(null, '', currentPage === 'accueil' ? '/' : `/?page=${currentPage}`);
  closeMenu(); window.scrollTo({ top: 0, behavior: 'auto' });
}

const ORDER_TIMELINE = [
  ['Demande','Ta demande a bien été reçue.'],
  ['Recherche','Nous recherchons le produit qui correspond à ta demande.'],
  ['Proposition','Ta proposition et le montant sont disponibles.'],
  ['Commandée','Ton achat est validé et la commande est lancée.'],
  ['Expédiée','Ton colis est en route.'],
  ['Livrée','La commande est indiquée comme livrée.'],
  ['Terminée','La commande est terminée et compte dans ta fidélité.'],
];
const STATUS_STAGE = { new:0, searching:1, proposal:2, ordered:3, shipped:4, delivered:5, closed:6, product_to_pay:2, product_paid:3, shipping_to_pay:3, receipt_confirmation:5, archived:6 };
const ADMIN_STAGES = [['new','Demande reçue'],['searching','Recherche en cours'],['proposal','Proposition disponible'],['ordered','Commandée'],['shipped','Expédiée'],['delivered','Livrée'],['closed','Terminée']];
function timelineMarkup(order) {
  const stage = STATUS_STAGE[order.status] ?? 0;
  return `<ol class="orderTimeline">${ORDER_TIMELINE.map(([title, detail], index) => `<li class="timelineStep ${index < stage ? 'done' : ''} ${index === stage ? 'active' : ''}"><span class="timelineDot" aria-hidden="true">${index < stage ? '✓' : String(index + 1).padStart(2,'0')}</span><div><b>${title}</b><p>${detail}</p></div></li>`).join('')}</ol>`;
}
function paymentStatusLabel(status) { return status === 'confirmed' ? 'Paiement confirmé' : status === 'reported' ? 'Paiement signalé — vérification en cours' : 'En attente de paiement'; }
function paymentMarkup(order) {
  if (!order.amount_cents) return order.status === 'proposal' ? `<div class="paymentPanel waiting"><div><small>PAIEMENT</small><b>Montant en attente</b><p>Le prix sera affiché ici dès qu’il aura été défini.</p></div></div>` : '';
  const confirmed = order.payment_status === 'confirmed', reported = order.payment_status === 'reported';
  return `<div class="paymentPanel ${confirmed ? 'paid' : reported ? 'reported' : ''}">
    <div class="paymentTop"><div><small>PAIEMENT C-SHOP.FR</small><b>${money(order.amount_cents)}</b></div><span class="paymentStatus">${confirmed ? '✓' : reported ? '◌' : '●'} ${paymentStatusLabel(order.payment_status)}</span></div>
    <div class="paypalRow"><span>PayPal</span><strong>${escapeHtml(paypalEmail)}</strong><button type="button" data-copy-paypal>Copier</button></div>
    ${confirmed ? '<p class="paymentHelp success">Ton paiement a été vérifié et confirmé.</p>' : reported ? '<p class="paymentHelp">Tu as signalé ton paiement. Nous allons le vérifier.</p>' : `<div class="paymentButtons"><button class="reviewButton premiumAction" type="button" data-payment-report="${order.id}">J’ai effectué le paiement</button><button class="chatToggle premiumAction" type="button" data-proof-chat="${order.id}">Ajouter une preuve</button></div><p class="paymentHelp">Pour une capture de paiement, utilise « Ajouter une preuve » puis joins ton image dans la discussion.</p>`}
  </div>`;
}
function orderCard(order) {
  const date = new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeStyle:'short'}).format(new Date(order.created_at));
  const review = ['delivered','closed','receipt_confirmation'].includes(order.status) && !order.review_rating ? `<button class="reviewButton premiumAction" data-review="${order.id}">Laisser un avis</button>` : '';
  return `<article class="order customerOrder"><div class="orderHeader"><div><small>COMMANDE</small><h3>#CSP-${order.id}</h3><p class="orderDate">Demandée le ${date}</p></div><span class="statusPill">${escapeHtml(order.status_label)}</span></div>${articlesMarkup(order)}${paymentMarkup(order)}<div class="timelinePanel"><p class="timelineKicker">SUIVI DE COMMANDE</p>${timelineMarkup(order)}</div><div class="orderActions"><button class="chatToggle premiumAction" data-chat="${order.id}">Discuter avec C SHOP.FR</button>${review}</div><div class="chat hidden" id="chat-${order.id}"></div></article>`;
}

async function refreshUser() {
  const data = await api('/api/auth/me', { headers: {} }); currentUser = data.user;
  $('#loginButton').textContent = currentUser ? `${currentUser.name} · Déconnexion` : 'Se connecter avec Google';
  $('#adminNavLink').classList.toggle('hidden', !currentUser?.admin); return currentUser;
}
function connect(destination='accueil') { location.assign(`/api/auth/google?next=${encodeURIComponent(destination)}`); }
async function showOrders() {
  if (!currentUser) return connect('suivi');
  try {
    const data = await api('/api/orders', { headers: {} }); paypalEmail = data.paypal_email || paypalEmail;
    const badge = data.customer?.loyal ? `<span class="loyalBadge">★ Client fidèle · ${data.customer.completed_purchases} achats</span>` : `<span class="loyalProgress">Fidélité : ${Math.min(data.customer?.completed_purchases || 0, 5)}/5 achats</span>`;
    const blocked = data.customer?.blacklisted ? `<span class="blockedBadge">Compte limité</span>` : '';
    $('#accountLine').innerHTML = `Connecté avec <strong>${escapeHtml(currentUser.email)}</strong> ${badge} ${blocked}`;
    $('#ordersContent').innerHTML = data.orders.length ? data.orders.map(orderCard).join('') : '<p>Tu n’as encore envoyé aucune demande. Utilise « Faire une demande » pour commencer.</p>';
  } catch (error) { $('#ordersContent').innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
  showPage('suivi');
}
function reviewCard(review) { const stars='★'.repeat(review.rating)+'☆'.repeat(5-review.rating),date=new Intl.DateTimeFormat('fr-FR',{year:'numeric',month:'long'}).format(new Date(review.reviewed_at)); return `<article class="reviewCard"><div class="reviewTop"><span class="reviewAvatar">C</span><div><b>Client C SHOP.FR</b><small>Avis vérifié · ${date}</small></div></div><p class="reviewStars">${stars}</p><p class="reviewText">${escapeHtml(review.comment)}</p></article>`; }
function homeReviewCard(review) { const stars='★'.repeat(review.rating)+'☆'.repeat(5-review.rating); return `<article class="homeReviewCard"><p class="homeReviewStars">${stars}</p><p class="homeReviewText">“${escapeHtml(review.comment)}”</p><div class="homeReviewMeta"><span class="reviewAvatar">C</span><div><b>Client C SHOP.FR</b><small>Avis vérifié</small></div></div></article>`; }
async function loadHomeReviews() { const target=$('#homeReviewsContent'); if(!target)return; try{const {reviews}=await api('/api/reviews',{headers:{}});target.innerHTML=reviews.length?reviews.slice(0,3).map(homeReviewCard).join(''):'<p class="homeReviewsEmpty">Les premiers avis vérifiés apparaîtront ici après les commandes.</p>';}catch{target.innerHTML='<p class="homeReviewsEmpty">Les avis seront disponibles ici très bientôt.</p>';} }
async function showReviews() { $('#reviewsContent').innerHTML='<p class="reviewsLoading">Chargement des avis…</p>';showPage('avis');try{const {reviews}=await api('/api/reviews',{headers:{}});$('#reviewsContent').innerHTML=reviews.length?reviews.map(reviewCard).join(''):'<p class="reviewsEmpty">Les premiers avis apparaîtront ici après les commandes.</p>';}catch{$('#reviewsContent').innerHTML='<p class="reviewsEmpty">Impossible de charger les avis pour le moment.</p>';} }
function openRequest(product='') { showPage('demande'); const article=$('[data-article]'); if(article&&product) article.querySelector('[name="product"]').value=product; setTimeout(()=>article?.querySelector('[name="product"]')?.focus(),300); }

function adminOrderCard(order) {
  const customerFlags = `${order.loyal ? `<span class="loyalBadge">★ Client fidèle · ${order.completed_purchases} achats</span>` : `<span class="loyalProgress">${order.completed_purchases || 0}/5 achats</span>`}${order.blacklisted ? '<span class="blockedBadge">BLACKLIST</span>' : ''}`;
  return `<article class="order adminOrder"><div class="adminSummary"><div class="adminOrderTitle"><div><p class="status">${escapeHtml(order.status_label)}</p><b>#CSP-${order.id}</b></div>${customerFlags}</div><p><strong>${escapeHtml(order.first_name)} ${escapeHtml(order.last_name)}</strong> · <button class="emailLink" data-history-email="${escapeHtml(order.customer_email)}">${escapeHtml(order.customer_email)}</button></p>${articlesMarkup(order)}</div>
  <div class="adminControls">
    <label>ÉTAPE <select data-status="${order.id}">${ADMIN_STAGES.map(([value,text])=>`<option value="${value}" ${value===order.status?'selected':''}>${text}</option>`).join('')}</select></label>
    <label>PRIX (€)<input data-price="${order.id}" inputmode="decimal" placeholder="Ex. 49,99" value="${order.amount_cents ? (order.amount_cents/100).toFixed(2).replace('.',',') : ''}"></label>
    <div class="adminButtonRow"><button class="updateButton" data-update="${order.id}">Mettre à jour + e-mail</button><button class="secondaryAdminButton" data-save-price="${order.id}">Enregistrer le prix</button></div>
    <div class="adminPaymentState"><span>${paymentStatusLabel(order.payment_status)}</span>${order.payment_status==='reported'?`<button class="confirmPaymentButton" data-confirm-payment="${order.id}">Confirmer le paiement</button>`:''}${order.payment_status==='confirmed'?`<button class="secondaryAdminButton" data-reset-payment="${order.id}">Remettre en attente</button>`:''}</div>
    ${order.status==='closed'?`<button class="closeOrderButton" data-close-order="${order.id}">Archiver la commande</button>`:''}
  </div><div class="adminChat"><button class="chatToggle" data-chat="${order.id}">Discuter avec le client</button><div class="chat hidden" id="chat-${order.id}"></div></div></article>`;
}
function adminDashboardMarkup() {
  const active=adminState.orders.filter(o=>o.status!=='closed').length;
  const reported=adminState.payments.filter(p=>p.payment_status==='reported').length;
  const loyal=adminState.clients.filter(c=>c.loyal).length;
  const revenue=adminState.payments.filter(p=>p.payment_status==='confirmed').reduce((sum,p)=>sum+Number(p.amount_cents||0),0);
  return `<div class="adminMetrics"><article><small>COMMANDES EN COURS</small><b>${active}</b></article><article><small>PAIEMENTS À VÉRIFIER</small><b>${reported}</b></article><article><small>CLIENTS FIDÈLES</small><b>${loyal}</b></article><article><small>BLACKLIST</small><b>${adminState.blacklist.length}</b></article><article class="wideMetric"><small>PAIEMENTS CONFIRMÉS</small><b>${money(revenue)}</b></article></div><div class="adminDashboardColumns"><div><h3>À traiter</h3>${adminState.orders.filter(o=>o.status!=='closed').slice(0,5).map(o=>`<button class="dashboardRow" data-admin-tab="orders"><span>#CSP-${o.id} · ${escapeHtml(o.customer_email)}</span><b>${escapeHtml(o.status_label)}</b></button>`).join('')||'<p class="legal">Aucune commande en cours.</p>'}</div><div><h3>Paiements signalés</h3>${adminState.payments.filter(p=>p.payment_status==='reported').slice(0,5).map(p=>`<button class="dashboardRow" data-admin-tab="payments"><span>#CSP-${p.order_id} · ${escapeHtml(p.customer_email)}</span><b>${money(p.amount_cents)}</b></button>`).join('')||'<p class="legal">Aucun paiement à vérifier.</p>'}</div></div>`;
}
function adminClientsTable(clients) {
  return `<div class="adminTableWrap"><table class="adminTable"><thead><tr><th>Client</th><th>Achats</th><th>Total payé</th><th>Statut</th><th></th></tr></thead><tbody>${clients.map(c=>`<tr><td><b>${escapeHtml(c.email)}</b><small>${escapeHtml(c.name||'Client')}</small></td><td>${c.completed_purchases}${c.loyal?' ★':''}</td><td>${money(c.total_paid_cents)}</td><td>${c.blacklisted?'<span class="blockedBadge">Blacklist</span>':c.loyal?'<span class="loyalBadge">Client fidèle</span>':'Actif'}</td><td><button data-history-email="${escapeHtml(c.email)}">Historique</button>${c.blacklisted?`<button data-unblacklist="${escapeHtml(c.email)}">Unblacklist</button>`:`<button data-quick-blacklist="${escapeHtml(c.email)}">Blacklist</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}
function adminPaymentsMarkup() {
  return `<div class="paymentAdminList">${adminState.payments.map(p=>`<article class="paymentAdminCard"><div><small>#CSP-${p.order_id}</small><b>${escapeHtml(p.customer_email)}</b><p>${escapeHtml(splitOrderField(p.product)[0]||p.product||'Commande')}</p></div><div class="paymentAdminAmount"><span>${money(p.amount_cents)}</span><strong class="payState ${p.payment_status||'none'}">${paymentStatusLabel(p.payment_status)}</strong></div><div class="paymentAdminActions"><button data-history-email="${escapeHtml(p.customer_email)}">Client</button>${p.payment_status==='reported'?`<button class="confirmPaymentButton" data-confirm-payment="${p.order_id}">Confirmer</button>`:''}</div></article>`).join('')||'<p>Aucun paiement pour le moment.</p>'}</div>`;
}
function blacklistMarkup() {
  return `<form id="blacklistForm" class="adminInlineForm"><label>GMAIL<input name="email" type="email" required placeholder="client@gmail.com"></label><label>RAISON<select name="reason"><option>Faux paiement</option><option>Spam</option><option>Abus</option><option>Commandes non payées</option><option>Autre</option></select></label><label>NOTE<input name="note" placeholder="Facultatif"></label><button class="updateButton" type="submit">Blacklist</button></form><div class="blacklistList">${adminState.blacklist.map(b=>`<article><div><b>${escapeHtml(b.email)}</b><p>${escapeHtml(b.reason||'Non précisée')} ${b.note?`· ${escapeHtml(b.note)}`:''}</p><small>${formatDate(b.created_at)}</small></div><button data-unblacklist="${escapeHtml(b.email)}">Unblacklist</button></article>`).join('')||'<p class="legal">Aucun Gmail blacklisté.</p>'}</div>`;
}
function historySearchMarkup() { return `<form id="historySearchForm" class="historySearch"><input name="email" type="email" required placeholder="Entre le Gmail du client…"><button type="submit">Rechercher</button></form><div id="historyResult"><p class="legal">Entre un Gmail pour afficher toute son activité.</p></div>`; }
function adminShell(active='dashboard') {
  const tabs=[['dashboard','Tableau de bord'],['orders','Commandes'],['payments','Paiements'],['clients','Clients'],['loyal','Clients fidèles'],['blacklist','Blacklist'],['history','Historique']];
  const content = active==='dashboard'?adminDashboardMarkup():active==='orders'?(adminState.orders.map(adminOrderCard).join('')||'<p>Aucune commande.</p>'):active==='payments'?adminPaymentsMarkup():active==='clients'?adminClientsTable(adminState.clients):active==='loyal'?adminClientsTable(adminState.clients.filter(c=>c.loyal)):active==='blacklist'?blacklistMarkup():historySearchMarkup();
  $('#adminContent').innerHTML = `<div class="adminTabs">${tabs.map(([id,name])=>`<button class="${id===active?'active':''}" data-admin-tab="${id}">${name}</button>`).join('')}</div><div id="adminNotice" class="adminNotice hidden"></div><div class="adminPanel" data-current-admin-tab="${active}">${content}</div>`;
}
async function loadAdminState() {
  const [orders,clients,blacklist,payments]=await Promise.all([api('/api/admin/orders',{headers:{}}),api('/api/admin/clients',{headers:{}}),api('/api/admin/blacklist',{headers:{}}),api('/api/admin/payments',{headers:{}})]);
  adminState={orders:orders.orders,clients:clients.clients,blacklist:blacklist.blacklist,payments:payments.payments};
}
async function showAdmin(tab='dashboard') { if(!currentUser)return connect('administration'); showPage('administration'); $('#adminContent').innerHTML='<p>Chargement de l’administration…</p>'; try{await loadAdminState();adminShell(tab);}catch(error){$('#adminContent').innerHTML=`<p>${escapeHtml(error.message)}</p>`;} }
function adminNotice(text,type='ok') { const box=$('#adminNotice'); if(!box)return; box.className=`adminNotice ${type}`; box.textContent=text; setTimeout(()=>box.classList.add('hidden'),5500); }

function chatMarkup(messages) { return `<div class="chatMessages">${messages.length?messages.map(message=>`<div class="chatMessage ${message.mine?'mine':''}"><span class="chatMeta">${message.author_role==='admin'?'C SHOP.FR':'Client'} · ${formatDate(message.created_at)}</span>${message.message?`<span class="chatText">${escapeHtml(message.message)}</span>`:''}${(message.files||[]).map(file=>`<a class="chatFile" href="/api/orders/${message.order_id||''}/files/${file.id}" download>📎 ${escapeHtml(file.file_name)} <small>${Math.ceil(file.size_bytes/1024)} Ko</small></a>`).join('')}</div>`).join(''):'<p class="legal">Aucun message pour le moment. Écris le premier.</p>'}</div><form class="chatForm" data-chat-form><input name="message" maxlength="1200" placeholder="Écrire un message…"><label class="chatFileButton">📎 Fichier<input name="files" type="file" multiple></label><button type="submit">Envoyer</button><small class="chatHelp">4 fichiers maximum · 8 Mo par fichier</small></form>`; }
async function openChat(id,forceOpen=false) { const panel=$(`#chat-${id}`); if(!panel)return; if(panel.classList.contains('hidden')||forceOpen){panel.innerHTML='<p class="legal">Chargement de la discussion…</p>';panel.classList.remove('hidden');try{const data=await api(`/api/orders/${id}/messages`,{headers:{}});panel.innerHTML=chatMarkup(data.messages);panel.querySelector('.chatMessages').scrollTop=panel.querySelector('.chatMessages').scrollHeight;}catch(error){panel.innerHTML=`<p class="legal">${escapeHtml(error.message)}</p>`;}}else panel.classList.add('hidden'); }
async function updateOrder(id) {
  const status=$(`[data-status="${id}"]`).value,price=$(`[data-price="${id}"]`)?.value.trim();
  try {
    if(price) await api('/api/admin/payments',{method:'PATCH',body:JSON.stringify({order_id:id,action:'set_price',amount:price})});
    const result=await api('/api/admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});
    await loadAdminState(); adminShell('orders');
    if(result.unchanged) adminNotice('Prix enregistré. L’étape n’a pas changé, donc aucun nouvel e-mail n’a été envoyé.');
    else if(result.email_sent) adminNotice(`Étape mise à jour : e-mail « ${result.status_label} » envoyé au client.`);
    else adminNotice(`Étape mise à jour, mais l’e-mail n’a pas pu partir : ${result.email_warning||'vérifie la configuration e-mail.'}`,'warn');
  } catch(error){alert(error.message);}
}
async function savePrice(id) { const value=$(`[data-price="${id}"]`)?.value.trim(); if(!value)return alert('Entre un prix.');try{await api('/api/admin/payments',{method:'PATCH',body:JSON.stringify({order_id:id,action:'set_price',amount:value})});await loadAdminState();adminShell('orders');adminNotice('Prix enregistré.');}catch(e){alert(e.message);} }
async function setPayment(id,status,tab='orders') { try{const result=await api('/api/admin/payments',{method:'PATCH',body:JSON.stringify({order_id:id,action:'set_status',status})});await loadAdminState();adminShell(tab);if(status==='confirmed'&&result.email_sent)adminNotice('Paiement confirmé et e-mail envoyé au client.');else if(status==='confirmed'&&result.email_warning)adminNotice(`Paiement confirmé, mais e-mail non envoyé : ${result.email_warning}`,'warn');else adminNotice('Statut du paiement mis à jour.');}catch(e){alert(e.message);} }
async function archiveOrder(id) { if(!confirm('Archiver cette commande terminée ? Elle restera dans l’historique client.'))return;try{await api('/api/admin/orders',{method:'POST',body:JSON.stringify({id})});await loadAdminState();adminShell('orders');adminNotice('Commande archivée.');}catch(e){alert(e.message);} }
async function blacklistEmail(email,reason='Autre',note='') { try{await api('/api/admin/blacklist',{method:'POST',body:JSON.stringify({email,action:'blacklist',reason,note})});await loadAdminState();adminShell('blacklist');adminNotice(`${email} est blacklisté.`);}catch(e){alert(e.message);} }
async function unblacklistEmail(email) { if(!confirm(`Retirer ${email} de la blacklist ?`))return;try{await api('/api/admin/blacklist',{method:'POST',body:JSON.stringify({email,action:'unblacklist'})});await loadAdminState();adminShell('blacklist');adminNotice(`${email} peut de nouveau commander.`);}catch(e){alert(e.message);} }
async function loadHistory(email) {
  const target=$('#historyResult'); if(!target)return; target.innerHTML='<p>Chargement…</p>';
  try{const h=await api(`/api/admin/history?email=${encodeURIComponent(email)}`,{headers:{}});target.innerHTML=`<div class="historyProfile"><div><small>CLIENT</small><h3>${escapeHtml(h.client?.name||'Client')}</h3><p>${escapeHtml(email)}</p></div><div class="historyStats"><span><b>${h.stats.completed_purchases}</b> achats</span><span><b>${money(h.stats.total_paid_cents)}</b> payé</span><span>${h.stats.loyal?'<b>★</b> Client fidèle':'Fidélité '+Math.min(h.stats.completed_purchases,5)+'/5'}</span>${h.blacklist?'<span class="blockedBadge">Blacklist</span>':''}</div></div><div class="historyColumns"><section><h4>Commandes</h4>${h.orders.map(o=>`<article class="historyItem"><b>#CSP-${o.id} · ${escapeHtml(o.status_label)}</b><p>${escapeHtml(splitOrderField(o.product)[0]||o.product)}</p><small>${formatDate(o.created_at)} · ${money(o.amount_cents)} · ${paymentStatusLabel(o.payment_status)}</small></article>`).join('')||'<p>Aucune commande.</p>'}</section><section><h4>Historique</h4>${h.logs.map(l=>`<article class="historyItem"><b>${escapeHtml(l.action)}</b><p>${escapeHtml(l.details||'')}</p><small>${formatDate(l.created_at)} · ${escapeHtml(l.actor_email||'system')}</small></article>`).join('')||'<p>Aucun événement.</p>'}</section><section><h4>E-mails automatiques</h4>${h.emails.map(m=>`<article class="historyItem"><b>${m.success?'✓':'⚠'} ${escapeHtml(m.subject)}</b><p>${m.success?'E-mail envoyé':escapeHtml(m.error_text||'Échec')}</p><small>${formatDate(m.created_at)}</small></article>`).join('')||'<p>Aucun e-mail enregistré.</p>'}</section></div>`;}catch(e){target.innerHTML=`<p>${escapeHtml(e.message)}</p>`;}
}
async function reportPayment(id) { if(!confirm('Confirmer que tu as effectué le paiement PayPal ?'))return;try{await api(`/api/orders/${id}/payment`,{method:'POST',body:'{}'});await showOrders();}catch(e){alert(e.message);} }
async function addReview(id) { const rating=prompt('Ta note de 1 à 5 :'),comment=prompt('Ton avis :');if(!rating||!comment)return;try{await api(`/api/orders/${id}/review`,{method:'POST',body:JSON.stringify({rating,comment})});await showOrders();loadHomeReviews();}catch(e){alert(e.message);} }

// Navigation et interactions générales
$$('[data-open-request]').forEach(b=>b.onclick=()=>openRequest());
$$('[data-open-orders]').forEach(b=>b.onclick=showOrders);
$$('[data-open-reviews]').forEach(b=>b.onclick=showReviews);
$$('.productCard[data-product]').forEach(card=>{const open=()=>openRequest(card.dataset.product);card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};});
$('#menuToggle').onclick=()=>document.body.classList.contains('menuOpen')?closeMenu():openMenu(); $('#menuClose').onclick=closeMenu; $('#menuOverlay').onclick=closeMenu;
$$('.menuNav [data-nav-page]').forEach(button=>button.onclick=()=>{const page=button.dataset.navPage;if(page==='suivi')return showOrders();if(page==='avis')return showReviews();if(page==='administration')return showAdmin();showPage(page);});
$$('.menuNav [data-nav-section]').forEach(button=>button.onclick=()=>{showPage('accueil');requestAnimationFrame(()=>document.getElementById(button.dataset.navSection)?.scrollIntoView({behavior:'smooth',block:'start'}));});
$$('[data-footer-page]').forEach(button=>button.onclick=()=>{const page=button.dataset.footerPage;if(page==='suivi')return showOrders();if(page==='avis')return showReviews();showPage(page);});
$$('[data-footer-section]').forEach(button=>button.onclick=()=>{showPage('accueil');requestAnimationFrame(()=>document.getElementById(button.dataset.footerSection)?.scrollIntoView({behavior:'smooth',block:'start'}));});
const revealSections=$$('.revealSection');if('IntersectionObserver'in window){const obs=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('isVisible');obs.unobserve(entry.target);}}),{threshold:.12,rootMargin:'0px 0px -45px'});revealSections.forEach(s=>obs.observe(s));}else revealSections.forEach(s=>s.classList.add('isVisible'));
$('#loginButton').onclick=async()=>{if(!currentUser)return connect();await api('/api/auth/logout',{method:'POST'});currentUser=null;$('#loginButton').textContent='Se connecter avec Google';$('#adminNavLink').classList.add('hidden');showPage('accueil');};

function refreshArticleLabels(){$$('[data-article]').forEach((article,index)=>{article.querySelector('legend').textContent=`ARTICLE ${index+1}`;const remove=article.querySelector('.removeArticle');if(remove)remove.hidden=index===0;});}
function makeArticle(){const article=$('[data-article]').cloneNode(true);article.querySelectorAll('input,textarea').forEach(field=>field.value='');const remove=document.createElement('button');remove.type='button';remove.className='removeArticle';remove.textContent='Retirer cet article';article.append(remove);$('#articles').append(article);refreshArticleLabels();article.querySelector('[name="product"]').focus();}
const addArticleButton=$('#addArticle');if(addArticleButton)addArticleButton.onclick=makeArticle;
$('#requestForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const message=$('#formMessage'),submit=form.querySelector('.send');if(!currentUser){message.className='message isError';message.textContent='Connecte-toi avec Google avant d’envoyer ta demande.';return connect('demande');}const articles=$$('[data-article]').map(article=>({product:article.querySelector('[name="product"]').value.trim(),size:article.querySelector('[name="size"]').value.trim(),budget:article.querySelector('[name="budget"]').value.trim(),colors:article.querySelector('[name="colors"]').value.trim(),remarks:article.querySelector('[name="remarks"]')?.value.trim()||''}));submit.disabled=true;submit.classList.add('isLoading');submit.querySelector('.sendLabel').textContent='Envoi en cours';message.className='message sendingMessage';message.innerHTML='<span class="inlineLoader"></span><span>Envoi de ta demande…</span>';try{const result=await api('/api/orders',{method:'POST',body:JSON.stringify({articles})});submit.classList.remove('isLoading');submit.classList.add('isSuccess');submit.querySelector('.sendLabel').textContent='Demande envoyée';submit.querySelector('.sendArrow').textContent='✓';message.className='message successMessage';message.innerHTML=`<span class="successCheck">✓</span><span><b>Demande envoyée avec succès !</b><small>Commande n°${result.id}${result.email_sent?' · e-mail de confirmation envoyé':' · commande enregistrée'}</small></span>`;form.reset();$$('[data-article]').slice(1).forEach(a=>a.remove());refreshArticleLabels();setTimeout(showOrders,1100);}catch(error){submit.disabled=false;submit.classList.remove('isLoading');submit.querySelector('.sendLabel').textContent='Envoyer la demande';submit.querySelector('.sendArrow').textContent='↗';message.className='message isError';message.textContent=error.message;}};

document.addEventListener('click',event=>{
  const remove=event.target.closest('.removeArticle');if(remove){remove.closest('[data-article]').remove();refreshArticleLabels();return;}
  const chat=event.target.closest('[data-chat]');if(chat)return openChat(chat.dataset.chat);
  const proof=event.target.closest('[data-proof-chat]');if(proof)return openChat(proof.dataset.proofChat,true);
  const review=event.target.closest('[data-review]');if(review)return addReview(review.dataset.review);
  const report=event.target.closest('[data-payment-report]');if(report)return reportPayment(report.dataset.paymentReport);
  const copy=event.target.closest('[data-copy-paypal]');if(copy){navigator.clipboard?.writeText(paypalEmail);copy.textContent='Copié ✓';setTimeout(()=>copy.textContent='Copier',1500);return;}
  const tab=event.target.closest('[data-admin-tab]');if(tab&&currentUser?.admin)return adminShell(tab.dataset.adminTab);
  const update=event.target.closest('[data-update]');if(update)return updateOrder(update.dataset.update);
  const save=event.target.closest('[data-save-price]');if(save)return savePrice(save.dataset.savePrice);
  const confirmPay=event.target.closest('[data-confirm-payment]');if(confirmPay)return setPayment(confirmPay.dataset.confirmPayment,'confirmed',$('.adminPanel')?.dataset.currentAdminTab||'orders');
  const resetPay=event.target.closest('[data-reset-payment]');if(resetPay)return setPayment(resetPay.dataset.resetPayment,'pending',$('.adminPanel')?.dataset.currentAdminTab||'orders');
  const archive=event.target.closest('[data-close-order]');if(archive)return archiveOrder(archive.dataset.closeOrder);
  const history=event.target.closest('[data-history-email]');if(history){adminShell('history');const input=$('#historySearchForm input[name="email"]');input.value=history.dataset.historyEmail;return loadHistory(history.dataset.historyEmail);}
  const quickBlacklist=event.target.closest('[data-quick-blacklist]');if(quickBlacklist){const reason=prompt('Raison de la blacklist :','Autre');if(reason===null)return;return blacklistEmail(quickBlacklist.dataset.quickBlacklist,reason);}
  const unblack=event.target.closest('[data-unblacklist]');if(unblack)return unblacklistEmail(unblack.dataset.unblacklist);
});

document.addEventListener('submit',async event=>{
  const chatForm=event.target.closest('[data-chat-form]');if(chatForm){event.preventDefault();const panel=chatForm.closest('.chat'),id=panel.id.replace('chat-',''),message=chatForm.elements.message.value.trim(),selected=[...chatForm.elements.files.files];if(!message&&!selected.length)return;if(selected.length>4)return alert('Tu peux joindre 4 fichiers maximum.');if(selected.some(f=>f.size>8*1024*1024))return alert('Chaque fichier doit faire moins de 8 Mo.');try{const files=await Promise.all(selected.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:reader.result});reader.onerror=reject;reader.readAsDataURL(file);})));await api(`/api/orders/${id}/messages`,{method:'POST',body:JSON.stringify({message,files})});const data=await api(`/api/orders/${id}/messages`,{headers:{}});panel.innerHTML=chatMarkup(data.messages);panel.querySelector('.chatMessages').scrollTop=panel.querySelector('.chatMessages').scrollHeight;}catch(e){alert(e.message);}return;}
  const blacklistForm=event.target.closest('#blacklistForm');if(blacklistForm){event.preventDefault();const d=Object.fromEntries(new FormData(blacklistForm));return blacklistEmail(d.email,d.reason,d.note);}
  const historyForm=event.target.closest('#historySearchForm');if(historyForm){event.preventDefault();return loadHistory(historyForm.elements.email.value.trim());}
});

loadHomeReviews();
refreshUser().then(()=>{const page=pageFromUrl();if(page==='suivi')return showOrders();if(page==='avis')return showReviews();if(page==='administration')return showAdmin();showPage(page,false);}).catch(()=>{const page=pageFromUrl();return page==='avis'?showReviews():showPage(page,false);});
