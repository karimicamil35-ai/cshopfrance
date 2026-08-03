const $ = selector => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

let currentUser = null;
const api = async (url, options = {}) => { const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.error || 'Une erreur est survenue.'), { status: response.status }); return body; };
const splitOrderField = value => String(value || '').split('\n').map((line, index) => line.replace(/^\s*\d+\.\s*/, '').trim() || (index === 0 ? '' : '')).filter((line, index, lines) => line || lines.length === 1);
function articlesMarkup(order) { const products = splitOrderField(order.product); const sizes = splitOrderField(order.size); const budgets = splitOrderField(order.budget); const details = splitOrderField(order.details); return `<div class="orderArticles">${products.map((product, index) => `<div class="orderArticle"><strong>Article ${index + 1}</strong><b>${escapeHtml(product)}</b><p><span>Taille</span>${escapeHtml(sizes[index] || 'Sans taille')} <i>·</i> <span>Budget</span>${escapeHtml(budgets[index] || 'Non indiqué')}</p>${details[index] && details[index] !== 'Aucun détail complémentaire' ? `<p class="articleDetails">${escapeHtml(details[index])}</p>` : ''}</div>`).join('')}</div>`; }
function orderCard(order) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    .format(new Date(order.created_at));
  const review = order.status === 'receipt_confirmation' ? `<button class="reviewButton" data-review="${order.id}">Confirmer la réception & laisser un avis</button>` : '';
  return `<article class="order"><p class="status">${escapeHtml(order.status_label)}</p>${articlesMarkup(order)}<p class="orderDate">Envoyée le ${date}</p><button class="chatToggle" data-chat="${order.id}">Discuter avec C SHOP.FR</button><div class="chat hidden" id="chat-${order.id}"></div>${review}</article>`;
}

async function refreshUser() { const data = await api('/api/auth/me', { headers: {} }); currentUser = data.user; $('#loginButton').textContent = currentUser ? `${currentUser.name} · Déconnexion` : 'Se connecter avec Google'; const email = $('#requestForm input[name="email"]'); if (currentUser) { email.value = currentUser.email; email.readOnly = true; } else { email.readOnly = false; } return currentUser; }
function connect() { window.location.assign('/api/auth/google'); }
async function showOrders() {
  if (!currentUser) return connect();
  try { const { orders } = await api('/api/orders', { headers: {} }); $('#accountLine').textContent = `Connecté avec ${currentUser.email}`; $('#ordersContent').innerHTML = orders.length ? orders.map(orderCard).join('') : '<p>Tu n’as encore envoyé aucune demande. Utilise « Faire une demande » pour commencer.</p>'; } catch (error) { $('#ordersContent').innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
  $('#suivi').classList.remove('hidden');
  $('#suivi').scrollIntoView({ behavior: 'smooth' });
}

function openRequest() {
  $('#demande').scrollIntoView({ behavior: 'smooth' });
  window.setTimeout(() => $('#requestForm input[name="firstName"]').focus(), 500);
}

function adminCard(order) { const states = [['new','Demande reçue'],['product_to_pay','Produit à payer'],['product_paid','Produit payé'],['shipping_to_pay','Livraison à payer'],['shipped','Colis expédié'],['receipt_confirmation','Réception à confirmer'],['closed','Terminée']]; const close = order.status === 'closed' ? `<button class="closeOrderButton" data-close-order="${order.id}">Fermer la commande</button>` : ''; return `<article class="order adminOrder"><div class="adminSummary"><p class="status">${escapeHtml(order.status_label)}</p><b>#${order.id}</b><p><strong>${escapeHtml(order.first_name)} ${escapeHtml(order.last_name)}</strong> · ${escapeHtml(order.customer_email)} · ${escapeHtml(order.phone)}</p><p>${escapeHtml(order.city)}</p>${articlesMarkup(order)}</div><div class="adminControls"><label>STATUT <select data-status="${order.id}">${states.map(([value, text]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${text}</option>`).join('')}</select></label><button class="updateButton" data-update="${order.id}">Mettre à jour</button>${close}</div><div class="adminChat"><button class="chatToggle" data-chat="${order.id}">Discuter avec le client</button><div class="chat hidden" id="chat-${order.id}"></div></div></article>`; }
async function showAdmin() { if (!currentUser) return connect(); try { const { orders } = await api('/api/admin/orders', { headers: {} }); $('#adminContent').innerHTML = orders.length ? orders.map(adminCard).join('') : '<p>Aucune demande pour le moment.</p>'; } catch (error) { $('#adminContent').innerHTML = `<p>${escapeHtml(error.message)}</p>`; } $('#administration').classList.remove('hidden'); $('#administration').scrollIntoView({ behavior: 'smooth' }); }
$('#ordersButton').onclick = showOrders;
$('#loginButton').onclick = async () => { if (!currentUser) return connect(); await api('/api/auth/logout', { method: 'POST' }); currentUser = null; $('#loginButton').textContent = 'Se connecter avec Google'; $('#suivi').classList.add('hidden'); $('#administration').classList.add('hidden'); };
$('#closeOrders').onclick = () => $('#suivi').classList.add('hidden');
$('#closeAdmin').onclick = () => $('#administration').classList.add('hidden');
document.querySelectorAll('a[href="#demande"]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); openRequest(); }));
document.querySelectorAll('a[href="#suivi"]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); showOrders(); }));

function refreshArticleLabels() {
  document.querySelectorAll('[data-article]').forEach((article, index) => {
    article.querySelector('legend').textContent = `ARTICLE ${index + 1}`;
    const remove = article.querySelector('.removeArticle');
    if (remove) remove.hidden = index === 0;
  });
}
function makeArticle() {
  const article = document.querySelector('[data-article]').cloneNode(true);
  article.querySelectorAll('input, textarea').forEach(field => field.value = '');
  const file = article.querySelector('input[type="file"]');
  if (file) file.value = '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'removeArticle';
  remove.textContent = 'Retirer cet article';
  article.append(remove);
  $('#articles').append(article);
  refreshArticleLabels();
  article.querySelector('[name="product"]').focus();
}
$('#addArticle').onclick = makeArticle;
document.addEventListener('click', event => {
  const remove = event.target.closest('.removeArticle');
  if (!remove) return;
  remove.closest('[data-article]').remove(); refreshArticleLabels();
});

$('#requestForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  if (!currentUser) { $('#formMessage').textContent = 'Connecte-toi avec Google avant d’envoyer ta demande.'; return connect(); }
  const customer = Object.fromEntries(new FormData(form));
  const articles = [...form.querySelectorAll('[data-article]')].map(article => ({
    product: article.querySelector('[name="product"]').value.trim(),
    size: article.querySelector('[name="size"]').value.trim(),
    budget: article.querySelector('[name="budget"]').value.trim(),
    details: article.querySelector('[name="details"]').value.trim()
  }));
  try {
    const result = await api('/api/orders', {
      method: 'POST', body: JSON.stringify({ ...customer, articles })
    });
    $('#formMessage').textContent = `Demande n°${result.id} envoyée. Elle est maintenant visible dans « Mes commandes ».`;
    form.reset();
    const extraArticles = [...form.querySelectorAll('[data-article]')].slice(1);
    extraArticles.forEach(article => article.remove());
    refreshArticleLabels();
    window.setTimeout(showOrders, 350);
  } catch (error) { $('#formMessage').textContent = error.message; }
};
function chatMarkup(messages) { return `<div class="chatMessages">${messages.length ? messages.map(message => `<div class="chatMessage ${message.mine ? 'mine' : ''}"><span class="chatMeta">${message.author_role === 'admin' ? 'C SHOP.FR' : 'Client'} · ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(message.created_at))}</span>${escapeHtml(message.message)}</div>`).join('') : '<p class="legal">Aucun message pour le moment. Écris le premier.</p>'}</div><form class="chatForm" data-chat-form><input name="message" maxlength="1200" required placeholder="Écrire un message…" aria-label="Message"><button type="submit">Envoyer</button></form>`; }
async function openChat(id) { const panel = $(`#chat-${id}`); if (!panel) return; if (panel.classList.contains('hidden')) { panel.innerHTML = '<p class="legal">Chargement de la discussion…</p>'; panel.classList.remove('hidden'); try { const data = await api(`/api/orders/${id}/messages`, { headers: {} }); panel.innerHTML = chatMarkup(data.messages); panel.querySelector('.chatMessages').scrollTop = panel.querySelector('.chatMessages').scrollHeight; } catch (error) { panel.innerHTML = `<p class="legal">${escapeHtml(error.message)}</p>`; } } else { panel.classList.add('hidden'); } }
document.addEventListener('submit', async event => { const form = event.target.closest('[data-chat-form]'); if (!form) return; event.preventDefault(); const panel = form.closest('.chat'); const id = panel.id.replace('chat-',''); const input = form.elements.message; const message = input.value.trim(); if (!message) return; try { await api(`/api/orders/${id}/messages`, { method: 'POST', body: JSON.stringify({ message }) }); const data = await api(`/api/orders/${id}/messages`, { headers: {} }); panel.innerHTML = chatMarkup(data.messages); panel.querySelector('.chatMessages').scrollTop = panel.querySelector('.chatMessages').scrollHeight; } catch (error) { alert(error.message); } });
document.addEventListener('click', async event => { const chat = event.target.closest('[data-chat]'); if (chat) return openChat(chat.dataset.chat); const update = event.target.closest('[data-update]'); if (update) { const id = update.dataset.update; const status = document.querySelector(`[data-status="${id}"]`).value; try { await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) }); await showAdmin(); } catch (error) { alert(error.message); } } const closeOrder = event.target.closest('[data-close-order]'); if (closeOrder) { if (!confirm('Fermer cette commande ? Elle sera retirée de ta liste principale, sans être supprimée.')) return; try { await api('/api/admin/orders', { method: 'POST', body: JSON.stringify({ id: closeOrder.dataset.closeOrder }) }); await showAdmin(); } catch (error) { alert(error.message); } } const review = event.target.closest('[data-review]'); if (review) { const rating = prompt('Ta note de 1 à 5 :'); const comment = prompt('Ton avis :'); if (!rating || !comment) return; try { await api(`/api/orders/${review.dataset.review}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }); await showOrders(); } catch (error) { alert(error.message); } } });
refreshUser().then(user => { if (user?.admin) { const button = document.createElement('button'); button.className = 'adminLink'; button.textContent = 'Administration'; button.onclick = showAdmin; $('.nav').append(button); } }).catch(() => {});
