import { belgianQuote } from './pricing.mjs';

const labels = {
  fr: ['Langue','Catalogue AW Dropship','Livraison standard AW offerte en Belgique dès 99 € TVAC.','Rechercher','Catégorie','Afficher plus','Panier AW de test','Toutes','Ajouter','Indisponible','Retirer','Articles','Livraison','Supplément AW','Total TVAC','Port à vérifier','Impossible de charger le catalogue'],
  nl: ['Taal','AW Dropship-catalogus','Gratis standaardverzending van AW in België vanaf € 99 incl. btw.','Zoeken','Categorie','Meer tonen','AW-testwinkelwagen','Alle','Toevoegen','Niet beschikbaar','Verwijderen','Artikelen','Verzending','AW-toeslag','Totaal incl. btw','Verzendkosten te controleren','De catalogus kon niet worden geladen'],
  en: ['Language','AW Dropship catalogue','Free standard AW shipping in Belgium from €99 incl. VAT.','Search','Category','Show more','AW test basket','All','Add','Unavailable','Remove','Items','Shipping','AW surcharge','Total incl. VAT','Shipping requires a quote','Could not load the catalogue']
};
const keys = 'language title offer search category more basket all add unavailable remove subtotal shipping surcharge total quote error'.split(' ');
const find = id => document.getElementById(id);
const basket = new Map();
const basketKey = 'corviane_aw_test_basket';
const categoryNames = {
  'Aromatherapy': ['Aromathérapie', 'Aromatherapie'],
  'Artisan Tea': ['Thés et infusions', 'Thee en kruideninfusies'],
  'Bags & Accessories': ['Sacs et accessoires', 'Tassen en accessoires'],
  'Bath & Body': ['Bain et corps', 'Bad en lichaamsverzorging'],
  'Candles & Holders': ['Bougies et bougeoirs', 'Kaarsen en kandelaars'],
  'Clothing': ['Vêtements', 'Kleding'],
  'Crystals & Esoterics': ['Cristaux et ésotérisme', 'Kristallen en esoterie'],
  'Fragrance': ['Parfums', 'Geuren'],
  'Home & Garden': ['Maison et jardin', 'Huis en tuin'],
  'Incense and Burners': ['Encens et brûleurs', 'Wierook en branders'],
  'Jewellery': ['Bijoux', 'Sieraden'],
  'Musical Instruments': ['Instruments de musique', 'Muziekinstrumenten'],
  'Packaging': ['Emballages', 'Verpakkingen'],
  'Pet Accessories': ['Accessoires pour animaux', 'Huisdieraccessoires'],
};

function saveBasket() {
  try {
    localStorage.setItem(basketKey, JSON.stringify(
      [...basket.values()].map(({ product, quantity }) => [product.sku, quantity])
    ));
  } catch { /* The basket remains usable in memory. */ }
}

function restoreBasket() {
  try {
    const saved = JSON.parse(localStorage.getItem(basketKey) || '[]');
    const bySku = new Map(products.map(product => [product.sku, product]));
    for (const [sku, quantity] of saved) {
      const product = bySku.get(sku);
      if (product?.active && product.stock > 0 && Number.isSafeInteger(quantity) && quantity > 0) {
        basket.set(sku, { product, quantity: Math.min(quantity, product.stock) });
      }
    }
  } catch { /* An invalid or unavailable saved basket can be ignored. */ }
}
let products = [];
let limit = 24;
let failed = false;
const lang = () => find('language').value;
const t = key => labels[lang()][keys.indexOf(key)];
const euro = cents => new Intl.NumberFormat(lang(), { style: 'currency', currency: 'EUR' }).format(cents / 100);

function node(tag, content) {
  const item = document.createElement(tag);
  if (content !== undefined) item.textContent = content;
  return item;
}

function renderBasket() {
  const lines = [...basket.values()];
  find('items').replaceChildren(...lines.map(({ product, quantity }) => {
    const line = node('li', `${quantity} × ${product.name}`);
    const remove = node('button', t('remove'));
    remove.onclick = () => {
      if (quantity === 1) basket.delete(product.sku);
      else basket.get(product.sku).quantity--;
      saveBasket();
      render();
    };
    line.append(remove);
    return line;
  }));
  const amount = belgianQuote(lines);
  find('total').textContent = amount.shipping === null
    ? `${t('subtotal')} ${euro(amount.subtotal)} · ${t('quote')}`
    : `${t('subtotal')} ${euro(amount.subtotal)} · ${t('shipping')} ${euro(amount.shipping)}` +
      (amount.surcharge ? ` · ${t('surcharge')} ${euro(amount.surcharge)}` : '') +
      ` · ${t('total')} ${euro(amount.total)}`;
}

function render() {
  const query = find('search').value.trim().toLowerCase();
  const category = find('category').value;
  const shown = products.filter(product =>
    (!category || product.category === category) &&
    `${product.name} ${product.sku}`.toLowerCase().includes(query));
  find('status').textContent = failed ? t('error') : `${shown.length} ${t('subtotal').toLowerCase()}`;
  find('next').hidden = shown.length <= limit;
  find('products').replaceChildren(...shown.slice(0, limit).map(product => {
    const card = node('article');
    if (product.photos.length) {
      const photo = node('img');
      photo.src = product.photos[0];
      photo.loading = 'lazy';
      photo.alt = product.name;
      card.append(photo);
    }
    const details = node('details');
    details.lang = 'en';
    details.append(node('summary', product.name), node('p', product.description));
    details.addEventListener('toggle', () => {
      if (!details.open || details.dataset.gallery) return;
      details.dataset.gallery = 'ready';
      for (const url of product.photos.slice(1)) {
        const image = node('img');
        image.src = url;
        image.alt = product.name;
        image.loading = 'lazy';
        details.append(image);
      }
    });
    const add = node('button', product.active && product.stock > 0 ? t('add') : t('unavailable'));
    const quantity = basket.get(product.sku)?.quantity ?? 0;
    add.disabled = !product.active || quantity >= product.stock;
    add.onclick = () => {
      const current = basket.get(product.sku)?.quantity ?? 0;
      if (current >= product.stock) return;
      basket.set(product.sku, { product, quantity: current + 1 });
      add.disabled = current + 1 >= product.stock;
      saveBasket();
      renderBasket();
    };
    card.append(node('h2', product.name), node('p', product.sku), details,
      node('p', `${euro(product.cents)} TVAC · × ${product.units}`), add);
    return card;
  }));
  renderBasket();
}

function localize() {
  document.documentElement.lang = lang();
  document.querySelectorAll('[data-t]').forEach(element => {
    element.textContent = t(element.dataset.t);
  });
  for (const option of find('category').options) {
    option.textContent = option.value
      ? categoryNames[option.value]?.[['fr', 'nl'].indexOf(lang())] ?? option.value
      : t('all');
  }
  render();
}

find('category').append(new Option(t('all'), ''));
find('language').onchange = localize;
for (const id of ['search', 'category']) find(id).oninput = () => { limit = 24; render(); };
find('next').onclick = () => { limit += 24; render(); };
try {
  const response = await fetch('./produits.json');
  if (!response.ok) throw new Error(response.statusText);
  products = await response.json();
  restoreBasket();
  const categories = [...new Set(products.map(product => product.category))].sort();
  categories.forEach(category => find('category').append(new Option(category, category)));
} catch {
  failed = true;
}
localize();
