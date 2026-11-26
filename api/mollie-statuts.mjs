const endpoint = 'https://api.mollie.com/v2/payments';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.MOLLIE_API_KEY;
  if (process.env.VERCEL_ENV !== 'preview' || !key?.startsWith('test_')) {
    return res.status(503).json({ error: 'Test indisponible.' });
  }
  const host = req.headers.host;
  const hosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean);
  if (req.method !== 'POST' || !hosts.includes(host) || req.headers.origin !== 'https://' + host) {
    return res.status(403).json({ error: 'Ouvre le test depuis son aperçu Vercel.' });
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: '5.00' },
        description: 'CORVIANE — test des statuts Bancontact',
        method: 'bancontact',
        redirectUrl: 'https://' + host + '/mollie-statuts.html?retour=1',
        metadata: { source: 'corviane-preview' }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Mollie a refusé le paiement de test.');
    const payment = await response.json();
    const checkout = new URL(payment._links?.checkout?.href);
    if (payment.mode !== 'test' || !/^tr_[a-zA-Z0-9]{5,80}$/.test(payment.id) ||
        checkout.protocol !== 'https:' ||
        !(checkout.hostname === 'mollie.com' || checkout.hostname.endsWith('.mollie.com'))) {
      throw new Error('Réponse de test invalide.');
    }
    return res.json({ id: payment.id, checkout: checkout.href });
  } catch {
    return res.status(502).json({ error: 'Impossible de lancer le test Bancontact.' });
  }
}
