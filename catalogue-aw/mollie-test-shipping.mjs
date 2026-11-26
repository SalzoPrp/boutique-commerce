import { belgianQuote } from './pricing.mjs';

const shippingBands = new Map([
  ['FR', [[250, 750], [2000, 780], [5000, 1290], [30000, 1320]]],
  ['DE', [[1000, 585], [2000, 590], [3000, 755], [30000, 785]]],
  ['LU', [[2000, 670], [3000, 1050], [30000, 1100]]],
  ['NL', [[2000, 670], [3000, 1050], [30000, 1100]]]
]);

export function previewQuote(country, lines) {
  const base = belgianQuote(lines);
  const grams = lines.reduce((total, { product, quantity }) => total + product.grams * quantity, 0);
  if (base.shipping === null || !Number.isSafeInteger(grams) || grams <= 0) return null;
  if (country === 'BE') return { ...base, grams };

  const band = shippingBands.get(country)?.find(([limit]) => grams <= limit);
  if (!band) return null;

  // CORVIANE's customer rate for this weight range already includes VAT.
  const fixedShipping = (country === 'NL' || country === 'LU') && grams > 3000 && grams <= 5000;
  const shipping = fixedShipping ? 1100 : Math.round(band[1] * 1.21);
  return { ...base, grams, shipping, total: base.subtotal + shipping + base.surcharge };
}
