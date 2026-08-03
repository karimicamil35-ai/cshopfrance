const $ = selector => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

let currentUser = null;
const api = async (url, options = {}) => { const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.error || 'Une erreur est survenue.'), { status: response.status }); return body; };
function orderCard(order) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    .format(new Date(order.created_at));
  const review = order.status === 'receipt_confirmation' ? `<button class="reviewButton" data-review="${order.id}">Confirmer la réception & laisser un avis</button>` : '';
  return `<article class="order"><p class="status">${escapeHtml(order.status_label)}</p><b>${escapeHtml(order.product)}</b><p>${escapeHtml(order.size || 'Sans taille')} · Budget : ${escapeHtml(order.budget || 'non indiqué')}</p><p class="orderDate">Envoyée le ${date}</p>${review}</article>`;
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

function adminCard(order) { const states = [['new','Demande reçue'],['product_to_pay','Produit à payer'],['product_paid','Produit payé'],['shipping_to_pay','Livraison à payer'],['shipped','Colis expédié'],['receipt_confirmation','Réception à confirmer'],['closed','Terminée']]; return `<article class="order adminOrder"><p class="status">${escapeHtml(order.status_label)}</p><b>#${order.id} · ${escapeHtml(order.product)}</b><p><strong>${escapeHtml(order.first_name)} ${escapeHtml(order.last_name)}</strong> · ${escapeHtml(order.customer_email)} · ${escapeHtml(order.phone)}</p><p>${escapeHtml(order.city)} · ${escapeHtml(order.size || 'Sans taille')} · Budget : ${escapeHtml(order.budget || 'non indiqué')}</p><p>${escapeHtml(order.details || 'Aucun détail complémentaire')}</p><label>STATUT <select data-status="${order.id}">${states.map(([value, text]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${text}</option>`).join('')}</select></label><button class="updateButton" data-update="${order.id}">Mettre à jour</button></article>`; }
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
$('#addArticle').onclick = () => {
  const articles = $('#articles');
  const copy = articles.querySelector('[data-article]').cloneNode(true);
  copy.querySelectorAll('input, textarea').forEach(field => { field.value = ''; });
  const oldRemove = copy.querySelector('.removeArticle');
  if (oldRemove) oldRemove.remove();
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'removeArticle'; remove.textContent = 'Retirer cet article';
  copy.append(remove); articles.append(copy); refreshArticleLabels();
};
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
    product: article.querySelector('[name="product"]').value,
    size: article.querySelector('[name="size"]').value,
    budget: article.querySelector('[name="budget"]').value,
    details: article.querySelector('[name="details"]').value
  }));
  try {
    const results = await Promise.all(articles.map(article => api('/api/orders', {
      method: 'POST', body: JSON.stringify({ ...customer, ...article })
    })));
    $('#formMessage').textContent = results.length === 1
      ? `Demande n°${results[0].id} envoyée. Elle est maintenant visible dans « Mes commandes ».`
      : `${results.length} articles ont été ajoutés à ta demande. Ils sont maintenant visibles dans « Mes commandes ».`;
    form.reset();
    const extraArticles = [...form.querySelectorAll('[data-article]')].slice(1);
    extraArticles.forEach(article => article.remove());
    refreshArticleLabels();
    window.setTimeout(showOrders, 350);
  } catch (error) { $('#formMessage').textContent = error.message; }
};
document.addEventListener('click', async event => { const update = event.target.closest('[data-update]'); if (update) { const id = update.dataset.update; const status = document.querySelector(`[data-status="${id}"]`).value; try { await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) }); await showAdmin(); } catch (error) { alert(error.message); } } const review = event.target.closest('[data-review]'); if (review) { const rating = prompt('Ta note de 1 à 5 :'); const comment = prompt('Ton avis :'); if (!rating || !comment) return; try { await api(`/api/orders/${review.dataset.review}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }); await showOrders(); } catch (error) { alert(error.message); } } });
refreshUser().then(user => { if (user?.admin) { const button = document.createElement('button'); button.className = 'adminLink'; button.textContent = 'Administration'; button.onclick = showAdmin; $('.nav').append(button); } }).catch(() => {});
