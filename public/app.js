const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'cshopfrance_orders';

const getOrders = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};
const saveOrders = orders => localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

function orderCard(order) {
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    .format(new Date(order.createdAt));
  return `<article class="order"><p class="status">Demande reçue</p><b>${escapeHtml(order.product)}</b><p>${escapeHtml(order.size || 'Sans taille')} · Budget : ${escapeHtml(order.budget || 'non indiqué')}</p><p class="orderDate">Envoyée le ${date}</p></article>`;
}

function showOrders() {
  const orders = getOrders();
  $('#ordersContent').innerHTML = orders.length
    ? orders.map(orderCard).join('')
    : '<p>Tu n’as encore envoyé aucune demande. Utilise « Faire une demande » pour commencer.</p>';
  $('#suivi').classList.remove('hidden');
  $('#suivi').scrollIntoView({ behavior: 'smooth' });
}

function openRequest() {
  $('#demande').scrollIntoView({ behavior: 'smooth' });
  window.setTimeout(() => $('#requestForm input[name="firstName"]').focus(), 500);
}

$('#ordersButton').onclick = showOrders;
$('#loginButton').onclick = showOrders;
$('#closeOrders').onclick = () => $('#suivi').classList.add('hidden');
document.querySelectorAll('a[href="#demande"]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); openRequest(); }));
document.querySelectorAll('a[href="#suivi"]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); showOrders(); }));

$('#requestForm').onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const request = Object.fromEntries(new FormData(form));
  delete request.photos;
  const orders = getOrders();
  orders.unshift({ ...request, createdAt: new Date().toISOString() });
  saveOrders(orders);
  $('#formMessage').textContent = 'Demande envoyée. Elle est maintenant visible dans « Mes commandes ».';
  form.reset();
  window.setTimeout(showOrders, 350);
};
