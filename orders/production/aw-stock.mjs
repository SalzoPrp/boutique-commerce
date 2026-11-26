const base = 'https://api.aiku.io/dropshipping/products';

async function findProduct(endpoint, sku, token) {
  const url = new URL(endpoint);
  url.searchParams.set('search', sku);
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error('AW stock lookup failed');
  const { data } = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid AW stock response');
  return data.find(item => item?.code === sku);
}

export async function hasAvailableStock(articles, token) {
  if (!token) throw new Error('Missing AW read token');
  for (let offset = 0; offset < articles.length; offset += 5) {
    const checks = await Promise.all(articles.slice(offset, offset + 5).map(async ({ sku, quantity }) => {
      const catalogueItem = await findProduct(base, sku, token);
      const stock = catalogueItem
        ? catalogueItem.current_stock
        : (await findProduct(base + '/my-products', sku, token))?.quantity_left;
      if (stock === undefined || stock === null || stock === '') throw new Error('AW stock not confirmed');
      const available = Number(stock);
      if (!Number.isSafeInteger(available) || available < 0) throw new Error('Invalid AW stock value');
      return available >= quantity;
    }));
    if (checks.includes(false)) return false;
  }
  return true;
}
