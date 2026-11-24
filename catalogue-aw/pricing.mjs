export function belgianQuote(lines) {
  const subtotal = lines.reduce((total, line) => total + line.product.cents * line.quantity, 0);
  const grams = lines.reduce((total, line) => total + line.product.grams * line.quantity, 0);
  const purchase = lines.reduce(
    (total, line) => total + Math.round(line.product.cents / 1.573) * line.quantity, 0
  );
  if (lines.length === 0) return { subtotal: 0, shipping: 0, surcharge: 0, total: 0 };
  const band = [[1000, 600], [2000, 630], [3000, 1070], [30000, 1100]]
    .find(([limit]) => grams <= limit);
  if (!band || lines.some(({ product }) => product.grams <= 0)) return { subtotal, shipping: null };
  const shipping = subtotal >= 9900 ? 0 : Math.round(band[1] * 1.21);
  const surcharge = purchase < 300 ? 121 : 0;
  return { subtotal, shipping, surcharge, total: subtotal + shipping + surcharge };
}
