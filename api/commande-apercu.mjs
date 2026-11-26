import { readFileSync } from 'node:fs';
import { previewQuote } from '../catalogue-aw/mollie-test-shipping.mjs';

const products = new Map(JSON.parse(readFileSync(
  new URL('../catalogue-aw/produits.json', import.meta.url), 'utf8'
)).map(product => [product.sku, product]));
const payments = 'https://api.mollie.com/v2/payments';
const source = 'corviane-order-preview';
const countryCodes = new Set(['BE', 'FR', 'DE', 'LU', 'NL']);
const statuses = new Set(['open', 'pending', 'authorized', 'paid', 'failed', 'canceled', 'expired']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const paymentId = /^tr_[a-zA-Z0-9]{5,80}$/;
const fields = ['prenom', 'nom', 'email', 'telephone', 'adresse', 'codePostal', 'ville'];

async function json(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Service indisponible.');
  return response.json();
}

function prepareOrder(body) {
  const { basket, country, contact, conditions } = body;
  if (!countryCodes.has(country) || conditions !== true || !Array.isArray(basket) ||
      !basket.length || basket.length > 100) return null;
  const customer = {};
  for (const field of fields) {
    const value = contact?.[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 254) return null;
    customer[field] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return null;
  const lines = [];
  const seen = new Set();
  for (const entry of basket) {
    const [sku, quantity] = Array.isArray(entry) ? entry : [];
    const product = products.get(sku);
    if (!product?.active || seen.has(sku) || !Number.isSafeInteger(quantity) ||
        quantity < 1 || quantity > Math.min(99, product.stock)) return null;
    seen.add(sku);
    lines.push({ product, quantity });
  }
  const quote = previewQuote(country, lines);
  if (!quote || !Number.isSafeInteger(quote.total) || quote.total < 2) return null;
  return {
    country, customer, quote,
    articles: lines.map(({ product, quantity }) => ({
      sku: product.sku, name: product.name, unitCents: product.cents, quantity
    }))
  };
}

function matchPayment(payment, order) {
  return payment.mode === 'test' && payment.metadata?.source === source &&
    payment.metadata.order === order.id && paymentId.test(payment.id) &&
    (!order.payment_id || payment.id === order.payment_id) &&
    payment.amount?.currency === 'EUR' &&
    payment.amount.value === (order.details.quote.total / 100).toFixed(2) &&
    statuses.has(payment.status);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.MOLLIE_API_KEY;
  const database = process.env.CORVIANE_PREVIEW_DATABASE_URL || process.env.CORVIANE_PREVIEW_SUPABASE_URL;
  const databaseKey = process.env.CORVIANE_PREVIEW_DATABASE_KEY || process.env.CORVIANE_PREVIEW_SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.VERCEL_ENV !== 'preview' || !key?.startsWith('test_') ||
      !database?.startsWith('https://') || !databaseKey) {
    return res.status(503).json({ error: 'Le stockage des commandes de test reste à configurer.' });
  }
  const table = new URL('/rest/v1/corviane_preview_orders', database);
  const dbHeaders = { apikey: databaseKey, Authorization: 'Bearer ' + databaseKey,
    'Content-Type': 'application/json' };
  const mollieHeaders = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const rowUrl = id => new URL('?id=eq.' + id, table);
  const loadOrder = async id => (await json(rowUrl(id), { headers: dbHeaders }))[0];

  try {
    if (req.method === 'GET') {
      const id = req.query.commande;
      if (!uuid.test(id || '')) return res.status(400).json({ error: 'Référence invalide.' });
      const order = await loadOrder(id);
      if (!order) return res.status(404).json({ error: 'Commande de test introuvable.' });
      return res.json({ status: order.payment_status });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
    if (req.query.webhook === '1') {
      const id = typeof req.body === 'string' ? new URLSearchParams(req.body).get('id') : req.body?.id;
      if (!paymentId.test(id || '')) return res.status(400).end();
      const payment = await json(payments + '/' + id, { headers: mollieHeaders });
      const orderId = payment.metadata?.order;
      if (payment.metadata?.source !== source || !uuid.test(orderId || '')) return res.status(200).end();
      const order = await loadOrder(orderId);
      if (!order || !matchPayment(payment, order)) return res.status(409).end();
      const updateUrl = rowUrl(orderId);
      updateUrl.searchParams.set('payment_status', 'eq.' + order.payment_status);
      updateUrl.searchParams.set('payment_id', order.payment_id ? 'eq.' + order.payment_id : 'is.null');
      if (['open', 'pending', 'authorized'].includes(order.payment_status)) {
        const rows = await json(updateUrl, { method: 'PATCH',
          headers: { ...dbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ payment_id: id, payment_status: payment.status }) });
        if (!rows.length) return res.status(409).end();
      }
      return res.status(200).end();
    }

    const host = req.headers.host;
    const hosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean);
    if (!hosts.includes(host) || req.headers.origin !== 'https://' + host) {
      return res.status(403).json({ error: 'Ouvrez la commande depuis son aperçu Vercel.' });
    }
    const { attempt, expectedTotal } = req.body ?? {};
    const details = prepareOrder(req.body ?? {});
    if (!uuid.test(attempt || '') || !details) return res.status(400).json({ error: 'Vérifiez votre panier et vos coordonnées.' });
    if (expectedTotal !== details.quote.total) return res.status(409).json({ error: 'Le total a changé. Rechargez le récapitulatif.' });

    await json(table, { method: 'POST', headers: { ...dbHeaders, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id: attempt, details }) });
    const order = await loadOrder(attempt);
    if (!order || !matchDetails(order.details, details)) return res.status(409).json({ error: 'La référence de commande est déjà utilisée.' });
    const webhookUrl = new URL('/api/commande-apercu?webhook=1', 'https://' + host);
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) webhookUrl.searchParams.set('x-vercel-protection-bypass', bypass);
    const amount = { currency: 'EUR', value: (details.quote.total / 100).toFixed(2) };
    const payment = order.payment_id
      ? await json(payments + '/' + order.payment_id, { headers: mollieHeaders })
      : await json(payments, {
        method: 'POST', headers: { ...mollieHeaders, 'Idempotency-Key': attempt },
        body: JSON.stringify({
          amount, description: 'CORVIANE — commande test ' + attempt,
          metadata: { source, order: attempt },
          redirectUrl: 'https://' + host + '/checkout-aw.html?commande=' + attempt,
          webhookUrl: webhookUrl.href
        })
      });
    if (!matchPayment(payment, order)) throw new Error('Paiement invalide.');
    const link = new URL(payment._links?.checkout?.href);
    if (link.protocol !== 'https:' || !(link.hostname === 'mollie.com' || link.hostname.endsWith('.mollie.com'))) {
      throw new Error('Lien Mollie invalide.');
    }
    if (!order.payment_id) {
      const updateUrl = rowUrl(attempt);
      updateUrl.searchParams.set('payment_id', 'is.null');
      await json(updateUrl, { method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ payment_id: payment.id }) });
    }
    return res.json({ checkout: link.href });
  } catch {
    return res.status(502).json({ error: 'La commande de test n’a pas pu être traitée.' });
  }
}

function matchDetails(saved, current) {
  return saved.country === current.country &&
    fields.every(field => saved.customer[field] === current.customer[field]) &&
    Object.keys(current.quote).every(key => saved.quote[key] === current.quote[key]) &&
    saved.articles.length === current.articles.length &&
    current.articles.every((article, index) =>
      Object.keys(article).every(key => saved.articles[index][key] === article[key]));
}
