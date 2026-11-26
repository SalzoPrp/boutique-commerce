const countries = { BE: 'Belgique', FR: 'France', DE: 'Allemagne', LU: 'Luxembourg', NL: 'Pays-Bas' };
const money = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });
const euros = cents => money.format(cents / 100);

export function paidConfirmation(order) {
  if (order.payment_status !== 'paid') throw new Error('La commande doit être payée.');
  const { customer, country, articles, quote } = order.details;
  const itemLines = articles.map(({ name, quantity, unitCents }) =>
    name + ' × ' + quantity + ' — ' + euros(unitCents * quantity));
  const lines = [
    'Bonjour ' + customer.prenom + ',', '',
    'Votre paiement a été confirmé. Merci pour votre commande chez CORVIANE.', '',
    'Référence : ' + order.id,
    'Pays de livraison : ' + countries[country], '',
    ...itemLines, '',
    'Articles : ' + euros(quote.subtotal),
    'Livraison : ' + euros(quote.shipping)
  ];
  if (quote.surcharge) lines.push('Supplément petite commande : ' + euros(quote.surcharge));
  lines.push('Total payé : ' + euros(quote.total), '', 'Service client CORVIANE : contact@corviane.eu');
  return { to: customer.email, subject: 'CORVIANE — Confirmation de la commande ' + order.id, text: lines.join('\n') };
}
