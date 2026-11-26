import { previewQuote } from '../catalogue-aw/mollie-test-shipping.mjs';

const api = '/api/commande-apercu';
const statusLabels = {
  open: 'En attente', pending: 'En attente', authorized: 'Autorisée',
  paid: 'Payée', failed: 'Échouée', canceled: 'Annulée', expired: 'Expirée'
};

async function read(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

export function connect({ form, commander, message, euros, loadArray, currentLines, ready, refresh }) {
  const get = id => document.getElementById(id);
  const country = get('pays');
  const condition = get('conditions');
  const reference = new URLSearchParams(location.search).get('commande');
  let attempt;
  let lastBody;
  let busy = false;
  let quote;

  document.querySelector('.checkout-intro').textContent = 'Vérifiez votre panier et utilisez des coordonnées fictives pour le paiement de test.';
  document.querySelector('.checkout-payment-info').textContent = 'Paiement Mollie en mode test. Aucun débit réel.';
  document.querySelector('.checkout-total span').textContent = 'Total';
  document.querySelector('aside .checkout-note').textContent = 'Total de test avec livraison. Aucun achat réel.';
  get('paymentNotice').textContent = 'Votre commande de test sera enregistrée avant la redirection vers Mollie.';
  commander.textContent = 'Payer en mode test';

  if (reference) {
    for (const control of form.elements) control.disabled = true;
    const articles = get('checkoutArticles');
    articles.replaceChildren();
    for (const id of ['sousTotal', 'livraisonPrix', 'total']) get(id).textContent = '—';
    country.selectedIndex = -1;
    get('paymentNotice').textContent = 'Récapitulatif de la commande enregistrée.';
    document.querySelector('.checkout-intro').textContent = 'Consultez votre commande de test.';
    message.classList.remove('checkout-error');
    message.textContent = 'Chargement de la commande…';
    read(api + '?commande=' + encodeURIComponent(reference)).then(order => {
      country.value = order.country;
      for (const article of order.articles) {
        const row = document.createElement('div');
        row.className = 'checkout-summary-line';
        const name = document.createElement('span');
        name.textContent = article.name + ' × ' + article.quantity;
        const price = document.createElement('strong');
        price.textContent = euros(article.unitCents * article.quantity / 100);
        row.append(name, price);
        articles.append(row);
      }
      get('sousTotal').textContent = euros(order.quote.subtotal / 100);
      get('livraisonPrix').textContent = euros(order.quote.shipping / 100) +
        (order.quote.surcharge ? ' + ' + euros(order.quote.surcharge / 100) + ' de supplément' : '');
      get('total').textContent = euros(order.quote.total / 100);
      message.textContent = 'Commande test ' + reference + ' · ' + statusLabels[order.status];
    }).catch(error => { message.textContent = error.message; });
    return;
  }

  function render() {
    const lines = currentLines();
    quote = ready() && lines.length ? previewQuote(country.value, lines) : null;
    if (quote) {
      get('livraisonPrix').textContent = euros(quote.shipping / 100) +
        (quote.surcharge ? ' + ' + euros(quote.surcharge / 100) + ' de supplément' : '');
      get('total').textContent = euros(quote.total / 100);
    }
    commander.disabled = busy || Boolean(reference) || !quote || !form.checkValidity();
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (commander.disabled || !form.reportValidity() || !quote) return;
    const basket = loadArray('corviane_aw_test_basket');
    if (JSON.stringify(basket) !== JSON.stringify(currentLines().map(
      ({ product, quantity }) => [product.sku, quantity]
    ))) {
      message.textContent = 'Le panier a changé. Rechargez la page.';
      return;
    }
    const details = {
      basket, country: country.value, contact: Object.fromEntries(new FormData(form)),
      conditions: condition.checked, expectedTotal: quote.total
    };
    const body = JSON.stringify(details);
    if (body !== lastBody) {
      attempt = crypto.randomUUID();
      lastBody = body;
    }
    busy = true;
    render();
    try {
      const result = await read(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, attempt })
      });
      location.assign(result.checkout);
    } catch (error) {
      message.textContent = error.message;
      busy = false;
      render();
    }
  }, true);

  refresh();
  render();
}
