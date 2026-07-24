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

const MONTHLY_SHIPPING_PRICE = 'price_1Tu9h9EA9V2oCitagttzyLXc';
const COUPON_ID = '0TWbNFex';
const FREE_SHIPPING_QUANTITY = 4;
const DEFAULT_CANCEL_URL = 'https://lamaisonwinnie.com/beta-v3-29.html?checkout=cancelled#composer';

function safeCancelUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_CANCEL_URL));
    return url.origin === 'https://lamaisonwinnie.com' ? url.toString() : DEFAULT_CANCEL_URL;
  } catch {
    return DEFAULT_CANCEL_URL;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { rabbitName, deliveryMode, items, cancelUrl } = req.body || {};
    if (!['one_time', 'monthly'].includes(deliveryMode)) {
      return res.status(400).json({ error: 'Le rythme de livraison est invalide.' });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Ajoutez au moins un produit à la box.' });
    }

    let quantityTotal = 0;
    const isMonthly = deliveryMode === 'monthly';
    const lineItems = items.map((item) => {
      const product = PRODUCT_PRICES[item?.id];
      const quantity = Number(item?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error('La composition envoyée est invalide.');
      }
      quantityTotal += quantity;
      return { price: isMonthly ? product.monthly : product.oneTime, quantity };
    });

    const shippingFree = quantityTotal >= FREE_SHIPPING_QUANTITY;
    if (isMonthly && !shippingFree) lineItems.push({ price: MONTHLY_SHIPPING_PRICE, quantity: 1 });

    const normalizedName = String(rabbitName || '').trim().slice(0, 22);
    const nameField = {
      key: 'prenomdulapin',
      label: { type: 'custom', custom: 'Prénom du lapin' },
      type: 'text',
      optional: false,
    };
    if (normalizedName) nameField.text = { default_value: normalizedName };

    const metadata = {
      rabbit_name: normalizedName || 'À renseigner dans Checkout',
      delivery_mode: deliveryMode,
      shipping_free: String(shippingFree),
      automatic_discount: String(quantityTotal >= 8),
      composition: JSON.stringify(items),
    };

    const sessionConfig = {
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: lineItems,
      custom_fields: [nameField],
      metadata,
      success_url: 'https://lamaisonwinnie.com/checkout-success.html?sid={CHECKOUT_SESSION_ID}',
      cancel_url: safeCancelUrl(cancelUrl),
      shipping_address_collection: { allowed_countries: ['FR'] },
      phone_number_collection: { enabled: true },
    };

    if (quantityTotal >= 8) sessionConfig.discounts = [{ coupon: COUPON_ID }];
    else sessionConfig.allow_promotion_codes = true;

    if (!isMonthly && !shippingFree) {
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
  } catch (error) {
    console.error('Erreur checkout Beta:', error);
    return res.status(500).json({ error: error?.message || 'Erreur lors de la création du paiement.' });
  }
}
