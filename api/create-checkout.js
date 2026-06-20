// api/create-checkout.js
//
// Crée dynamiquement une session Stripe Checkout pour La Maison Winnie,
// avec deux custom_fields :
// - prnomdulapin       : prénom du lapin (saisi librement)
// - preferencebox      : préférence de composition (liste déroulante)
//
// Le code promo LAPIN25 (-25% sur le premier mois) est appliqué
// automatiquement à chaque session créée.
//
// Le front-end (version-14-1.html) doit appeler cette fonction en POST
// avec { rabbitName, preference } puis rediriger le navigateur vers
// l'URL renvoyée (session.url).
//
// Variables d'environnement nécessaires :
// - STRIPE_SECRET_KEY  : clé restreinte avec les droits d'écriture sur
//   Checkout Sessions, Customers, Subscriptions (+ lecture sur Prices)
//   — attention, la clé restreinte "Read only" utilisée pour le webhook
//   NE SUFFIT PAS ici, il faut une clé différente, dédiée à ce projet.
// - STRIPE_PRICE_ID    : l'ID du prix Stripe pour l'abonnement LMW
// - STRIPE_PROMO_CODE_ID : l'ID du Promotion Code Stripe pour LAPIN25
//   (différent entre mode Live et mode Test — pense à utiliser le bon
//   selon l'environnement sur lequel ce projet pointe à un instant donné)

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PREFERENCE_OPTIONS = [
  { label: 'Équilibrée — 50% friandises / 50% jouets', value: 'equilibree' },
  { label: 'Gourmande — 75% friandises / 25% jouets', value: 'gourmande' },
  { label: 'Occupation — 75% jouets / 25% friandises', value: 'occupation' },
  { label: 'Mastication douce', value: 'mastication' },
];

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
    const { rabbitName, preference } = req.body || {};

    if (!rabbitName || !preference) {
      return res.status(400).json({ error: 'rabbitName et preference sont requis.' });
    }

    const sessionConfig = {
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      custom_fields: [
        {
          key: 'prnomdulapin',
          label: { type: 'custom', custom: 'Prénom du Lapin' },
          type: 'text',
          text: { default_value: rabbitName },
        },
        {
          key: 'preferencebox',
          label: { type: 'custom', custom: 'Préférence de composition' },
          type: 'dropdown',
          dropdown: {
            options: PREFERENCE_OPTIONS,
            default_value: preference,
          },
        },
      ],
      success_url: 'https://lamaisonwinnie.com/merci.html',
      cancel_url: 'https://lamaisonwinnie.com/version-14-1.html',
      // Collecte l'adresse de livraison du client — indispensable pour
      // savoir où expédier la box chaque mois. Limité à la France pour
      // l'instant ; ajoute d'autres codes pays ISO si besoin (ex: 'BE', 'CH').
      shipping_address_collection: {
        allowed_countries: ['FR'],
      },
      // Code promo LAPIN25 (-25% sur le premier mois) appliqué
      // automatiquement à chaque nouvelle commande — équivalent au
      // paramètre ?prefilled_promo_code=LAPIN25 qu'on utilisait avec le
      // Payment Link statique, mais ici fait directement côté serveur
      // puisqu'on construit la session nous-mêmes.
      discounts: [
        { promotion_code: process.env.STRIPE_PROMO_CODE_ID },
      ],
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur création session Checkout:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
}
