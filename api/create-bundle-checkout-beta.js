import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_IDS = new Set([
  'calendula',
  'rose',
  'camomille_bio',
  'hibiscus_rouge',
  'plantain',
  'pissenlit',
  'framboisier',
  'noisetier',
]);

const BUNDLES = {
  complete: {
    price: 'price_1TwjFMEA9V2oCitaKT42MAti',
    name: 'Box complète',
    requiredQuantity: 6,
  },
  flowers: {
    price: 'price_1TwjGZEA9V2oCitaYIIeOcw3',
    name: 'Box Fleurs',
    composition: [
      { id: 'calendula', quantity: 1 },
      { id: 'rose', quantity: 1 },
      { id: 'camomille_bio', quantity: 1 },
      { id: 'hibiscus_rouge', quantity: 1 },
    ],
  },
  plants: {
    price: 'price_1TwjMWEA9V2oCital2EngLSj',
    name: 'Box Plantes',
    composition: [
      { id: 'plantain', quantity: 1 },
      { id: 'pissenlit', quantity: 1 },
      { id: 'framboisier', quantity: 1 },
      { id: 'noisetier', quantity: 1 },
    ],
  },
  mixed: {
    price: 'price_1TwjNIEA9V2oCitaFYR8FwuA',
    name: 'Box Mélange',
    composition: [
      { id: 'calendula', quantity: 1 },
      { id: 'rose', quantity: 1 },
      { id: 'plantain', quantity: 1 },
      { id: 'pissenlit', quantity: 1 },
    ],
  },
};

const DEFAULT_CANCEL_URL = 'https://lamaisonwinnie.com/beta-v3-29.html?checkout=cancelled#offres';

function safeCancelUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_CANCEL_URL));
    return url.origin === 'https://lamaisonwinnie.com' ? url.toString() : DEFAULT_CANCEL_URL;
  } catch {
    return DEFAULT_CANCEL_URL;
  }
}

function normalizeCompleteItems(items) {
  if (!Array.isArray(items) || items.length !== 6) {
    throw new Error('Choisissez exactement 6 références différentes.');
  }

  const seen = new Set();
  const normalized = items.map((item) => {
    const id = String(item?.id || '');
    const quantity = Number(item?.quantity);
    if (!PRODUCT_IDS.has(id) || quantity !== 1 || seen.has(id)) {
      throw new Error('La sélection de la Box complète est invalide.');
    }
    seen.add(id);
    return { id, quantity: 1 };
  });

  return normalized;
}

function rabbitNameField(name) {
  const field = {
    key: 'prenomdulapin',
    label: { type: 'custom', custom: 'Prénom du lapin' },
    type: 'text',
    optional: false,
  };
  if (name) field.text = { default_value: name };
  return field;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { rabbitName, bundleId, bundleItems, bundleQuantity, cancelUrl } = req.body || {};
    const bundle = BUNDLES[String(bundleId || '')];
    const quantity = Number(bundleQuantity || 1);

    if (!bundle) return res.status(400).json({ error: 'Cette offre est invalide.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ error: 'La quantité de box est invalide.' });
    }

    const normalizedName = String(rabbitName || '').trim().slice(0, 22);
    const composition = bundle.requiredQuantity
      ? normalizeCompleteItems(bundleItems)
      : bundle.composition;

    const metadata = {
      rabbit_name: normalizedName || 'À renseigner dans Checkout',
      delivery_mode: 'one_time',
      shipping_free: 'true',
      bundle_id: String(bundleId),
      bundle_name: bundle.name,
      bundle_quantity: String(quantity),
      composition_per_box: JSON.stringify(composition),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: bundle.price, quantity }],
      custom_fields: [rabbitNameField(normalizedName)],
      allow_promotion_codes: true,
      metadata,
      success_url: 'https://lamaisonwinnie.com/checkout-success.html?sid={CHECKOUT_SESSION_ID}',
      cancel_url: safeCancelUrl(cancelUrl),
      shipping_address_collection: { allowed_countries: ['FR'] },
      phone_number_collection: { enabled: true },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Erreur checkout bundles Beta:', error);
    return res.status(500).json({ error: error?.message || 'Erreur lors de la création du paiement.' });
  }
}
