/* netlify/functions/create-checkout.js
   Creates a Stripe Checkout session from cart items using lookup keys.
   - Finds existing customer by email, never creates duplicates
   - Validates add-ons require an active or in-cart membership
   Requires env vars: STRIPE_SECRET_KEY (in netlify)
*/

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Qualifying membership lookup keys
const MEMBERSHIP_IDS = new Set([
  'individual-monthly', 'individual-annual',
  'family-monthly',     'family-annual',
  'standard-office',
]);

// Add-on lookup keys that require a membership
const ADDON_IDS = new Set([
  'dry-storage-monthly',    'dry-storage-annual',
  'freezer-80-monthly',     'freezer-80-annual',
  'tissue-culture-monthly', 'tissue-culture-annual',
  'lab-bench',              'back-lab-office',
  'student-monthly',        'student-annual',
]);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, customerName, customerEmail } = JSON.parse(event.body);
    const origin = event.headers.origin
      || event.headers.referer
      || 'https://biocurious-hugo-site.netlify.app';

    // ── 1. Collect all lookup keys needed ──────────────────────────────────
    const lookupKeys = items.map(i => i.id);
    const hasSetup   = items.some(i => i.setup > 0);
    if (hasSetup && !lookupKeys.includes('setup-fee')) {
      lookupKeys.push('setup-fee');
    }

    // ── 2. Fetch all prices from Stripe in one call ─────────────────────────
    const { data: prices } = await stripe.prices.list({
      lookup_keys: lookupKeys,
      expand: ['data.product'],
    });

    const priceMap = {};
    prices.forEach(p => { priceMap[p.lookup_key] = p; });

    for (const key of lookupKeys) {
      if (!priceMap[key]) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Price not found in Stripe for: ${key}` }),
        };
      }
    }

    // ── 3. Find or create customer (never duplicate by email) ───────────────
    let customer;
    const existing = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (existing.data.length > 0) {
      customer = existing.data[0];
      if (customer.name !== customerName) {
        customer = await stripe.customers.update(customer.id, { name: customerName });
      }
    } else {
      customer = await stripe.customers.create({
        name:  customerName,
        email: customerEmail,
      });
    }

    // ── 4. Check existing active subscriptions ──────────────────────────────
    const activePriceIds  = new Set();
    const activeLookupIds = new Set();

    const existingSubs = await stripe.subscriptions.list({
      customer: customer.id,
      status:   'active',
      limit:    10,
    });

    existingSubs.data.forEach(sub => {
      sub.items.data.forEach(si => {
        activePriceIds.add(si.price.id);
        if (si.price.lookup_key) activeLookupIds.add(si.price.lookup_key);
      });
    });

    // ── 5. Membership dependency check ─────────────────────────────────────
    // Add-ons are only valid if:
    //   a) cart contains a qualifying membership, OR
    //   b) customer already has an active qualifying membership in Stripe
    const cartHasMembership     = items.some(i => MEMBERSHIP_IDS.has(i.id));
    const stripeHasMembership   = [...activeLookupIds].some(k => MEMBERSHIP_IDS.has(k));
    const hasQualifyingMembership = cartHasMembership || stripeHasMembership;

    const addonItems = items.filter(i => ADDON_IDS.has(i.id));
    if (addonItems.length > 0 && !hasQualifyingMembership) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Add-on services require an active Individual, Family, or Office membership. Please add a membership to your cart, or sign up for one first.',
        }),
      };
    }

    // ── 6. Split items — skip already-active subscriptions ─────────────────
    const subscriptionItems = [];
    const invoiceItems      = [];
    const skippedItems      = [];

    for (const item of items) {
      const price   = priceMap[item.id];
      const isRecur = item.freq === 'month' || item.freq === 'year';

      if (isRecur) {
        if (activePriceIds.has(price.id)) {
          skippedItems.push(item.name);
        } else {
          subscriptionItems.push({
            price:    price.id,
            quantity: item.qty || 1,
          });
        }
      } else {
        invoiceItems.push({
          price:    price.id,
          quantity: item.qty || 1,
        });
      }
    }

    // setup fee — one-time
    if (hasSetup) {
      invoiceItems.push({
        price:    priceMap['setup-fee'].id,
        quantity: 1,
      });
    }

    // if everything is already active
    if (subscriptionItems.length === 0 && invoiceItems.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `You already have an active subscription for: ${skippedItems.join(', ')}. Please contact us to make changes.`,
        }),
      };
    }

    // ── 7. Build session params ─────────────────────────────────────────────
    const sessionParams = {
      customer:    customer.id,
      success_url: origin + '/membership/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  origin + '/membership/?cancelled=true',
      billing_address_collection: 'auto',
      metadata: {
        skipped_items: skippedItems.join(', ') || 'none',
      },
    };

    if (subscriptionItems.length > 0) {
      sessionParams.mode       = 'subscription';
      sessionParams.line_items = [
        ...subscriptionItems,
        ...invoiceItems,
      ];
      sessionParams.subscription_data = {
        metadata: { customer_name: customerName },
      };
    } else {
      sessionParams.mode       = 'payment';
      sessionParams.line_items = invoiceItems;
    }

    // ── 8. Create session ───────────────────────────────────────────────────
    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:          session.url,
        skippedItems,
      }),
    };

  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};