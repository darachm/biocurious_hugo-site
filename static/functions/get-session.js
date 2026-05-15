/* netlify/functions/get-session.js
   Fetches a Stripe checkout session by ID for the success page.
   Only returns what the front-end needs — never exposes sensitive data.
   Requires env vars: STRIPE_SECRET_KEY
*/

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const MEMBERSHIP_IDS = new Set([
  'individual-monthly', 'individual-annual',
  'family-monthly',     'family-annual',
  'standard-office',
]);

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sessionId = event.queryStringParameters?.session_id;
  if (!sessionId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing session_id' }),
    };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price'],
    });

    const customerName  = session.customer_details?.name  || '';
    const customerEmail = session.customer_details?.email || '';
    const firstName     = customerName.split(' ')[0] || 'there';

    // check if any purchased item is a membership
    const purchasedIds = (session.line_items?.data || [])
      .map(li => li.price?.lookup_key)
      .filter(Boolean);

    const hasMembership = purchasedIds.some(id => MEMBERSHIP_IDS.has(id));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        customerEmail,
        hasMembership,
        purchasedIds,
      }),
    };

  } catch (err) {
    console.error('get-session error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};