import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ confirmed: false, error: 'Method Not Allowed' });
  }

  const sessionId = String(req.query?.sid || '').trim();
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ confirmed: false, error: 'Session invalide.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const confirmed =
      session.status === 'complete' &&
      ['paid', 'no_payment_required'].includes(session.payment_status);

    return res.status(confirmed ? 200 : 409).json({
      confirmed,
      status: session.status,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error('Erreur vérification session Checkout:', error);
    return res.status(404).json({ confirmed: false, error: 'Session introuvable.' });
  }
}
