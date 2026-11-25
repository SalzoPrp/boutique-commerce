import { readFileSync } from 'node:fs';
import { previewQuote } from '../catalogue-aw/mollie-test-shipping.mjs';

const products = new Map(JSON.parse(
  readFileSync(new URL('../catalogue-aw/produits.json', import.meta.url), 'utf8')
).map(product => [product.sku, product]));
const endpoint = 'https://api.mollie.com/v2/payments';
const marker = 'corviane-preview';
const statuses = new Set(['open', 'pending', 'authorized', 'paid', 'failed', 'canceled', 'expired']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.MOLLIE_API_KEY;
  if (process.env.VERCEL_ENV !== 'preview' || !key?.startsWith('test_')) {
    return res.status(503).json({ error: 'Le paiement de test est indisponible.' });
  }

  try {
    if (req.method === 'GET') {
      const id = req.query.id;
      if (typeof id !== 'string' || !/^tr_[a-zA-Z0-9]{5,80}$/.test(id)) {
        return res.status(400).json({ error: 'Référence de test invalide.' });
      }
      const response = await fetch(endpoint + '/' + id, {
        headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(502).json({ error: 'Statut indisponible chez Mollie.' });
      const payment = await response.json();
      if (payment.mode !== 'test' || payment.metadata?.source !== marker || !statuses.has(payment.status)) {
        return res.status(404).json({ error: 'Paiement de test introuvable.' });
      }
      return res.json({ status: payment.status });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Méthode non autorisée.' });
    }
    const host = req.headers.host;
    const permittedHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean);
    if (!permittedHosts.includes(host) || req.headers.origin !== 'https://' + host) {
      return res.status(403).json({ error: 'Ouvre la page depuis son aperçu Vercel.' });
    }

    const { basket, attempt, country, expectedTotal } = req.body ?? {};
    if (!Array.isArray(basket) || basket.length < 1 || basket.length > 100 ||
        (expectedTotal !== undefined && (typeof attempt !== 'string' || !/^[a-f0-9-]{36}$/i.test(attempt)))) {
      return res.status(400).json({ error: 'Panier ou référence de test invalide.' });
    }
    const lines = [];
    const seen = new Set();
    for (const entry of basket) {
      const [sku, quantity] = Array.isArray(entry) ? entry : [];
      const product = products.get(sku);
      if (!product?.active || seen.has(sku) || !Number.isSafeInteger(quantity) ||
          quantity < 1 || quantity > Math.min(99, product.stock)) {
        return res.status(400).json({ error: 'Un article du panier est indisponible.' });
      }
      seen.add(sku);
      lines.push({ product, quantity });
    }
    const quote = previewQuote(country, lines);
    if (!quote || !Number.isSafeInteger(quote.total) || quote.total < 2) {
      return res.status(400).json({ error: 'Livraison indisponible pour ce pays ou ce poids.' });
    }

    if (expectedTotal === undefined) return res.json({ quote });
    if (expectedTotal !== quote.total) {
      return res.status(409).json({ error: 'Le total a changé. Recalcule les frais avant de payer.' });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: (quote.total / 100).toFixed(2) },
        description: 'CORVIANE — test ' + country,
        restrictPaymentMethodsToCountry: country,
        redirectUrl: 'https://' + host + '/mollie-test.html?retour=1',
        metadata: { source: marker }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return res.status(502).json({ error: 'Mollie a refusé de créer le paiement de test.' });
    const payment = await response.json();
    const checkout = new URL(payment._links?.checkout?.href);
    if (payment.mode !== 'test' || checkout.protocol !== 'https:' ||
        !(checkout.hostname === 'mollie.com' || checkout.hostname.endsWith('.mollie.com'))) {
      return res.status(502).json({ error: 'Lien de paiement de test invalide.' });
    }
    return res.json({ id: payment.id, checkout: checkout.href });
  } catch {
    return res.status(502).json({ error: 'La connexion de test à Mollie a échoué.' });
  }
}
