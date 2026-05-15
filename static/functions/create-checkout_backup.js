const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, customerName, customerEmail } = JSON.parse(event.body);

    const origin = event.headers.origin || event.headers.referer || 'https://biocurious-hugo-site.netlify.app';

    // Create a Stripe customer with name and email so both appear in checkout
    const customer = await stripe.customers.create({
      name: customerName,
      email: customerEmail,
    });

    // Build line items dynamically from cart data
    const lineItems = [];

    for (const item of items) {
      const unitAmount = Math.round(item.price * 100); // Stripe uses cents

      if (item.freq === 'mo') {
        // Recurring subscription item
        const product = await stripe.products.create({
          name: item.name,
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: unitAmount,
          currency: 'usd',
          recurring: { interval: 'month' },
        });
        lineItems.push({ price: price.id, quantity: item.qty });
      } else {
        // One-time item
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: item.name },
            unit_amount: unitAmount,
          },
          quantity: item.qty,
        });
      }

      // Setup fee as a one-time line item
      if (item.setup && item.setup > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: item.name + ' — Setup fee' },
            unit_amount: Math.round(item.setup * 100),
          },
          quantity: 1,
        });
      }
    }

    // Determine session mode — if any item is recurring, use subscription mode
    const hasRecurring = items.some(i => i.freq === 'mo');
    const mode = hasRecurring ? 'subscription' : 'payment';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      customer: customer.id,
      success_url: origin + '/membership/success/',
      cancel_url: origin + '/membership/?cancelled=true',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
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