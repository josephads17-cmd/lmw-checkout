// api/create-checkout.js
//
// Crée une session Stripe Checkout pour le configurateur et les offres
// précomposées de La Maison Winnie. Les Price IDs, les règles de livraison
// et les remises restent exclusivement côté serveur.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_PRICES = {
  calendula: {
    oneTime: 'price_1Tu8g9EA9V2oCitax5HeBcAT',
    monthly: 'price_1Tu8g9EA9V2oCitaxvUOr0GW',
  },
  rose: {
    oneTime: 'price_1Tu8qHEA9V2oCita14Y9Pc7G',
    monthly: 'price_1Tu8qHEA9V2oCitaFoiR5oy3',
  },
  camomille_bio: {
    oneTime: 'price_1Tu8slEA9V2oCitafxqVUvCy',
    monthly: 'price_1Tu8slEA9V2oCitak1KVILg1',
  },
  hibiscus_rouge: {
    oneTime: 'price_1Tu8urEA9V2oCitaQc6G07E5',
    monthly: 'price_1Tu8urEA9V2oCitaFRvHpYE6',
  },
  plantain: {
    oneTime: 'price_1Tu8z0EA9V2oCitamWMjFanM',
    monthly: 'price_1Tu8z0EA9V2oCitaDHpWvJId',
  },
  pissenlit: {
    oneTime: 'price_1Tu914EA9V2oCitazZ1UxJ6F',
    monthly: 'price_1Tu914EA9V2oCitaN1bOu69w',
  },
  framboisier: {
    oneTime: 'price_1Tu939EA9V2oCitarwfrOpdV',
    monthly: 'price_1Tu939EA9V2oCitaErgnptQd',
  },
  noisetier: {
    oneTime: 'price_1Tu95AEA9V2oCitaFJgg3KZi',
    monthly: 'price_1Tu95AEA9V2oCitasNNRnXES',
  },
};

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

const MONTHLY_SHIPPING_PRICE = 'price_1Tu9h9EA9V2oCitagttzyLXc';
const FREE_SHIPPING_QUANTITY = 4;
const AUTOMATIC_DISCOUNT_REFERENCE = '0TWbNFex';
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

function normalizeItems(items, requiredQuantity = null) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Ajoutez au moins un produit à la box.');
  }

  const normalized = [];
  let totalQuantity = 0;

  for (const item of items) {
    const id = String(item?.id || '');
    const quantity = Number(item?.quantity);
    if (!PRODUCT_PRICES[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error('La composition envoyée est invalide.');
    }
    totalQuantity += quantity;
    normalized.push({ id, quantity });
  }

  if (requiredQuantity !== null && totalQuantity !== requiredQuantity) {
    throw new Error(`Sélectionnez exactement ${requiredQuantity} sachets.`);
  }

  return { items: normalized, totalQuantity };
}

async function resolveAutomaticDiscount() {
  try {
    const coupon = await stripe.coupons.retrieve(AUTOMATIC_DISCOUNT_REFERENCE);
    if (coupon?.valid) return { coupon: coupon.id };
  } catch {
    // La valeur peut être un code client plutôt qu'un identifiant de coupon.
  }

  try {
    const promotionCodes = await stripe.promotionCodes.list({
      code: AUTOMATIC_DISCOUNT_REFERENCE,
      active: true,
      limit: 1,
    });
    const promotionCode = promotionCodes.data[0];
    if (promotionCode) return { promotion_code: promotionCode.id };
  } catch (error) {
    console.error('Impossible de résoudre la remise automatique :', error);
  }

  throw new Error('La remise de 15 % n’est pas correctement configurée dans Stripe.');
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

function sharedSessionConfig({ normalizedName, cancelUrl, metadata }) {
  return {
    custom_fields: [rabbitNameField(normalizedName)],
    metadata,
    success_url: 'https://lamaisonwinnie.com/checkout-success.html?sid={CHECKOUT_SESSION_ID}',
    cancel_url: getSafeCancelUrl(cancelUrl),
    shipping_address_collection: { allowed_countries: ['FR'] },
    phone_number_collection: { enabled: true },
  };
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
        ? normalizeItems(bundleItems, bundle.requiredQuantity).items
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
        ...sharedSessionConfig({ normalizedName, cancelUrl, metadata }),
        mode: 'payment',
        line_items: [{ price: bundle.price, quantity: 1 }],
        allow_promotion_codes: true,
      });

      return res.status(200).json({ url: session.url });
    }

    if (!['one_time', 'monthly'].includes(deliveryMode)) {
      return res.status(400).json({ error: 'Le rythme de livraison est invalide.' });
    }

    const normalized = normalizeItems(items);
    const isMonthly = deliveryMode === 'monthly';
    const shippingIsFree = normalized.totalQuantity >= FREE_SHIPPING_QUANTITY;
    const automaticDiscount = normalized.totalQuantity >= 8
      ? await resolveAutomaticDiscount()
      : null;

    const lineItems = normalized.items.map((item) => ({
      price: isMonthly ? PRODUCT_PRICES[item.id].monthly : PRODUCT_PRICES[item.id].oneTime,
      quantity: item.quantity,
    }));

    if (isMonthly && !shippingIsFree) {
      lineItems.push({ price: MONTHLY_SHIPPING_PRICE, quantity: 1 });
    }

    const metadata = {
      rabbit_name: normalizedName || 'À renseigner dans Checkout',
      delivery_mode: deliveryMode,
      shipping_free: String(shippingIsFree),
      automatic_discount: String(Boolean(automaticDiscount)),
      composition: JSON.stringify(normalized.items),
    };

    const sessionConfig = {
      ...sharedSessionConfig({ normalizedName, cancelUrl, metadata }),
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: lineItems,
    };

    if (automaticDiscount) sessionConfig.discounts = [automaticDiscount];
    else sessionConfig.allow_promotion_codes = true;

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

    if (isMonthly) {
      sessionConfig.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur création session Checkout:', err);
    const message = err instanceof Error && err.message
      ? err.message
      : 'Erreur lors de la création du paiement.';
    return res.status(500).json({ error: message });
  }
}
