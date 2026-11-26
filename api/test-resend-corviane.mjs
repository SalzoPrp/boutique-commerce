import { paidConfirmation } from '../orders/production/confirmation.mjs';

const recipient = 'contact@corviane.eu';
const order = {
  id: 'TEST-RESEND-CORVIANE',
  payment_status: 'paid',
  details: {
    customer: { prenom: 'Hakan', email: recipient },
    country: 'BE',
    articles: [{ name: 'Article fictif', quantity: 1, unitCents: 1000 }],
    quote: { subtotal: 1000, shipping: 500, total: 1500 }
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'test-resend-corviane' ||
      Date.now() > Date.parse('2026-11-26T21:45:10.746Z')) {
    return res.status(404).end();
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; form-action 'self'");
    return res.end('<!doctype html><meta charset="utf-8"><title>Test CORVIANE</title><form method="post"><button>Envoyer le test à contact@corviane.eu</button></form>');
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers.origin !== 'https://' + req.headers.host) return res.status(403).end();
  const key = process.env.CORVIANE_RESEND_KEY;
  if (!key) return res.status(503).json({ error: 'Clé de test absente.' });

  try {
    const { subject, text } = paidConfirmation(order);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'corviane-preview-email-test-20261126'
      },
      body: JSON.stringify({
        from: 'CORVIANE <commandes@corviane.eu>',
        to: [recipient],
        reply_to: recipient,
        subject: '[TEST] ' + subject,
        text: 'Simulation technique. Aucune commande ni aucun paiement réel.\n\n' + text
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return res.status(502).json({ resendStatus: response.status });
    const { id } = await response.json();
    return id ? res.status(200).json({ id }) : res.status(502).end();
  } catch {
    return res.status(502).end();
  }
}
