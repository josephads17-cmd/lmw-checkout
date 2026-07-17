// api/create-checkout.js
//
// Crée une session Stripe Checkout pour la composition de box V3.19.
// Le navigateur envoie uniquement les identifiants de produits, leurs
// quantités, le rythme de livraison et le prénom. Les Price IDs et le
// calcul du seuil de livraison sont conservés côté serveur.

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

const MONTHLY_SHIPPING_PRICE = 'price_1Tu9h9EA9V2oCitagttzyLXc';
const FREE_SHIPPING_THRESHOLD_CENTS = 2990;
const PRODUCT_UNIT_PRICE_CENTS = 590;
const DEFAULT_CANCEL_URL = 'https://lamaisonwinnie.com/?checkout=cancelled#composer';

function getSafeCancelUrl(value) {
  if (!value) return DEFAULT_CANCEL_URL;

  try {
    const url = new URL(String(value));
    if (url.origin !== 'https://lamaisonwinnie.com') {
      return DEFAULT_CANCEL_URL;
    }
    return url.toString();
  } catch {
    return DEFAULT_CANCEL_URL;
  }
}

export default async function handler(req, res) {
  // Autorise les appels depuis le site (nécessaire car cette fonction vit
  // sur un domaine Vercel différent de lamaisonwinnie.com).
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rabbitName, deliveryMode, items, cancelUrl } = req.body || {};
    const normalizedName = String(rabbitName || '').trim().slice(0, 22);
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
      lineItems.push({
        price: isMonthly ? product.monthly : product.oneTime,
        quantity,
      });
    }

    const productsSubtotal = productQuantity * PRODUCT_UNIT_PRICE_CENTS;
    const shippingIsFree = productsSubtotal >= FREE_SHIPPING_THRESHOLD_CENTS;

    if (isMonthly && !shippingIsFree) {
      lineItems.push({ price: MONTHLY_SHIPPING_PRICE, quantity: 1 });
    }

    const rabbitNameField = {
      key: 'prenomdulapin',
      label: { type: 'custom', custom: 'Prénom du lapin' },
      type: 'text',
      optional: false,
    };
    if (normalizedName) {
      rabbitNameField.text = { default_value: normalizedName };
    }

    const sessionConfig = {
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: lineItems,
      custom_fields: [rabbitNameField],
      allow_promotion_codes: true,
      metadata: {
        rabbit_name: normalizedName || 'À renseigner dans Checkout',
        delivery_mode: deliveryMode,
        shipping_free: String(shippingIsFree),
        composition: JSON.stringify(items),
      },
      success_url: 'https://lamaisonwinnie.com/merci.html?sid={CHECKOUT_SESSION_ID}',
      cancel_url: getSafeCancelUrl(cancelUrl),
      // Collecte l'adresse de livraison du client — indispensable pour
      // savoir où expédier la box chaque mois. Limité à la France pour
      // l'instant ; ajoute d'autres codes pays ISO si besoin (ex: 'BE', 'CH').
      shipping_address_collection: {
        allowed_countries: ['FR'],
      },
      // Collecte le numéro de téléphone du client (utile pour le
      // transporteur en cas de besoin lors de la livraison).
      phone_number_collection: {
        enabled: true,
      },
    };

    // Les shipping_options sont uniquement disponibles pour une session
    // ponctuelle. En mensuel, le Price récurrent ci-dessus est ajouté à
    // l'abonnement sous le seuil de gratuité.
    if (!isMonthly && !shippingIsFree) {
      sessionConfig.shipping_options = [
        {
          shipping_rate_data: {
            display_name: 'Livraison standard',
            type: 'fixed_amount',
            fixed_amount: { amount: 499, currency: 'eur' },
            tax_behavior: 'inclusive',
            tax_code: 'txcd_92010001',
          },
        },
      ];
    }

    if (isMonthly) {
      sessionConfig.subscription_data = {
        metadata: {
          rabbit_name: normalizedName || 'À renseigner dans Checkout',
          delivery_mode: deliveryMode,
          shipping_free: String(shippingIsFree),
          composition: JSON.stringify(items),
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur création session Checkout:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
}
