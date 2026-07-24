// api/create-checkout.js
//
// Crée une session Stripe Checkout pour la composition officielle et les
// offres précomposées de la Beta. Les commandes classiques conservent leurs
// règles historiques tant que la Beta V3.28 n'est pas publiée.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_PRICES = {
  calendula: { oneTime: 'price_1Tu8g9EA9V2oCitax5HeBcAT', monthly: 'price_1Tu8g9EA9V2oCitaxvUOr0GW' },
  rose: { oneTime: 'price_1Tu8qHEA9V2oCita14Y9Pc7G', monthly: 'price_1Tu8qHEA9V2oCitaFoiR5oy3' },
  camomille_bio: { oneTime: 'price_1Tu8slEA9V2oCitafxqVUvCy', monthly: 'price_1Tu8slEA9V2oCitak1KVILg1' },
  hibiscus_rouge: { oneTime: 'price_1Tu8urEA9V2oCitaQc6G07E5', monthly: 'price_1Tu8urEA9V2oCitaFRvHpYE6' },
  plantain: { oneTime: 'price_1Tu8z0EA9V2oCitamWMjFanM', monthly: 'price_1Tu8z0EA9V2oCitaDHpWvJId' },
  pissenlit: { oneTime: 'price_1Tu914EA9V2oCitazZ1UxJ6F', monthly: 'price_1Tu914EA9V2oCitaN1bOu69w' },
  framboisier: { oneTime: 'price_1Tu939EA9V2oCitarwfrOpdV', monthly: 'price_1Tu939EA9V2oCitaErgnptQd' },
  noisetier: { oneTime: 'price_1Tu95AEA9V2oCitaFJgg3KZi', monthly: 'price_1Tu95AEA9V2oCitasNNRnXES' },
};

const BUNDLES = {
  complete: { price: 'price_1TwjFMEA9V2oCitaKT42MAti', name: 'Box complète', requiredQuantity: 6 },
  flowers: {
    price: 'price_1TwjGZEA9V2oCitaYIIeOcw3', name: 'Box Fleurs',
    composition: [
      { id: 'calendula', quantity: 1 }, { id: 'rose', quantity: 1 },
      { id: 'camomille_bio', quantity: 1 }, { id: 'hibiscus_rouge', quantity: 1 },
    ],
  },
  plants: {
    price: 'price_1TwjMWEA9V2oCital2EngLSj', name: 'Box Plantes',
    composition: [
      { id: 'plantain', quantity: 1 }, { id: 'pissenlit', quantity: 1 },
      { id: 'framboisier', quantity: 1 }, { id: 'noisetier', quantity: 1 },
    ],
  },
  mixed: {
    price: 'price_1TwjNIEA9V2oCitaFYR8FwuA', name: 'Box Mélange',
    composition: [
      { id: 'calendula', quantity: 1 }, { id: 'rose', quantity: 1 },
      { id: 'plantain', quantity: 1 }, { id: 'pissenlit', quantity: 1 },
    ],
  },
};

const MONTHLY_SHIPPING_PRICE = 'price_1Tu9h9EA9V2oCitagttzyLXc';
const FREE_SHIPPING_THRESHOLD_CENTS = 2990;
const PRODUCT_UNIT_PRICE_CENTS = 590;
const DEFAULT_CANCEL_URL = 'https://lamaisonwinnie.com/?checkout=cancelled#composer';

function getSafeCancelUrl(value) {
  if (!value) return DEFAULT_CANCEL_URL;
  try {
    const url = new URL(String(value));
    if (url.origin !== 'https://lamaisonwinnie.com') return DEFAULT_CANCEL_URL;
    return url.toString();
  } catch {
    return DEFAULT_CANCEL_URL;
  }
}

function rabbitNameField(normalizedName) {
  const field = {
    key: 'prenomdulapin',
    label: { type: 'custom', custom: 'Prénom du lapin' },
    type: 'text',
    optional: false,
  };
  if (normalizedName) field.text = { default_value: normalizedName };
  return field;
}

function validateBundleItems(items, requiredQuantity) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Choisissez les références de la Box complète.');
  let total = 0;
  const normalized = items.map((item) => {
    const id = String(item?.id || '');
    const quantity = Number(item?.quantity);
    if (!PRODUCT_PRICES[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 6) {
      throw new Error('La sélection de la Box complète est invalide.');
    }
    total += quantity;
    return { id, quantity };
  });
  if (total !== requiredQuantity) throw new Error(`Sélectionnez exactement ${requiredQuantity} références.`);
  return normalized;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rabbitName, deliveryMode, items, cancelUrl, bundleId, bundleItems } = req.body || {};
    const normalizedName = String(rabbitName || '').trim().slice(0, 22);

    if (bundleId) {
      const bundle = BUNDLES[String(bundleId)];
      if (!bundle) return res.status(400).json({ error: 'Cette offre est invalide.' });

      const composition = bundle.requiredQuantity
        ? validateBundleItems(bundleItems, bundle.requiredQuantity)
        : bundle.composition;

      const metadata = {
        rabbit_name: normalizedName || 'À renseigner dans Checkout',
        delivery_mode: 'one_time',
        shipping_free: 'true',
        bundle_id: String(bundleId),
        bundle_name: bundle.name,
        composition: JSON.stringify(composition),
      };

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: bundle.price, quantity: 1 }],
        custom_fields: [rabbitNameField(normalizedName)],
        allow_promotion_codes: true,
        metadata,
        success_url: 'https://lamaisonwinnie.com/checkout-success.html?sid={CHECKOUT_SESSION_ID}',
        cancel_url: getSafeCancelUrl(cancelUrl),
        shipping_address_collection: { allowed_countries: ['FR'] },
        phone_number_collection: { enabled: true },
      });

      return res.status(200).json({ url: session.url });
    }

    const isMonthly = deliveryMode === 'monthly';
    if (!['one_time', 'monthly'].includes(deliveryMode)) {
      return res.status(400).json({ error: 'Le rythme de livraison est invalide.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ajoutez au moins un produit à la box.' });
    }

    const lineItems = [];
    let productQuantity = 0;
    for (const item of items) {
      const product = PRODUCT_PRICES[item?.id];
      const quantity = Number(item?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).json({ error: 'La composition envoyée est invalide.' });
      }
      productQuantity += quantity;
      lineItems.push({ price: isMonthly ? product.monthly : product.oneTime, quantity });
    }

    const productsSubtotal = productQuantity * PRODUCT_UNIT_PRICE_CENTS;
    const shippingIsFree = productsSubtotal >= FREE_SHIPPING_THRESHOLD_CENTS;
    if (isMonthly && !shippingIsFree) lineItems.push({ price: MONTHLY_SHIPPING_PRICE, quantity: 1 });

    const metadata = {
      rabbit_name: normalizedName || 'À renseigner dans Checkout',
      delivery_mode: deliveryMode,
      shipping_free: String(shippingIsFree),
      composition: JSON.stringify(items),
    };

    const sessionConfig = {
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: lineItems,
      custom_fields: [rabbitNameField(normalizedName)],
      allow_promotion_codes: true,
      metadata,
      success_url: 'https://lamaisonwinnie.com/checkout-success.html?sid={CHECKOUT_SESSION_ID}',
      cancel_url: getSafeCancelUrl(cancelUrl),
      shipping_address_collection: { allowed_countries: ['FR'] },
      phone_number_collection: { enabled: true },
    };

    if (!isMonthly && !shippingIsFree) {
      sessionConfig.shipping_options = [{
        shipping_rate_data: {
          display_name: 'Livraison standard',
          type: 'fixed_amount',
          fixed_amount: { amount: 499, currency: 'eur' },
          tax_behavior: 'inclusive',
          tax_code: 'txcd_92010001',
        },
      }];
    }
    if (isMonthly) sessionConfig.subscription_data = { metadata };

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur création session Checkout:', err);
    const message = err instanceof Error && err.message ? err.message : 'Erreur lors de la création du paiement.';
    return res.status(500).json({ error: message });
  }
}
