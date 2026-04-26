/* netlify/functions/stripe-webhook.js
   Listens for Stripe checkout events and sends welcome emails.
   Requires env vars: STRIPE_WEBHOOK_SECRET, GMAIL_USER, GMAIL_APP_PASS
*/

const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

// Membership types that trigger a welcome email
const MEMBERSHIP_IDS = new Set([
  'individual-monthly', 'individual-annual',
  'family-monthly',     'family-annual',
  'standard-office',
]);

// Gmail transporter — swap to SMTP relay once Workspace admin is set up
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

/* ── Email template ── */
function buildWelcomeEmail(firstName) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to BioCurious</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f4; font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; }
    .wrapper { max-width: 620px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .header { background: #0d2340; padding: 32px 40px; text-align: center; }
    .header img { height: 40px; }
    .header h1 { color: #10a7dd; font-size: 26px; margin: 16px 0 4px; }
    .header p { color: #a0c4d8; font-size: 15px; margin: 0; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 16px; margin-bottom: 16px; }
    .intro { font-size: 15px; color: #374151; line-height: 1.65; margin-bottom: 28px; }
    .steps-heading { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #10a7dd; margin-bottom: 16px; }
    .step { display: flex; gap: 16px; margin-bottom: 24px; }
    .step-number { flex-shrink: 0; width: 36px; height: 36px; background: #10a7dd; color: #fff; border-radius: 50%; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .step-content h3 { font-size: 16px; font-weight: 700; color: #0d2340; margin: 0 0 6px; }
    .step-content p { font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 10px; }
    .btn { display: inline-block; background: #10a7dd; color: #ffffff !important; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-size: 14px; font-weight: 700; }
    .btn:hover { background: #0b85b0; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
    .info-box { background: #e6f6fc; border-left: 4px solid #10a7dd; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
    .info-box h3 { font-size: 15px; font-weight: 700; color: #0d2340; margin: 0 0 8px; }
    .info-box p { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
    .note-box { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
    .note-box p { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
    .cancellation { font-size: 13px; color: #6b7280; line-height: 1.65; margin-bottom: 24px; }
    .cancellation strong { color: #374151; }
    .social { text-align: center; margin-bottom: 24px; }
    .social p { font-size: 14px; color: #6b7280; margin-bottom: 10px; }
    .social a { display: inline-block; background: #e91e63; color: #fff !important; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; }
    .footer { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px 40px; text-align: center; }
    .footer p { font-size: 12px; color: #9ca3af; margin: 4px 0; }
    .footer a { color: #10a7dd; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>Welcome to BioCurious! 🧬</h1>
      <p>Your community biology lab in Silicon Valley</p>
    </div>

    <!-- Body -->
    <div class="body">
      <p class="greeting">Hi ${firstName},</p>
      <p class="intro">
        Welcome to BioCurious — you're joining a community of researchers who are eager to help you get started!
        Now that you're signed up online, there are <strong>3 steps to complete your membership</strong>:
      </p>

      <p class="steps-heading">Complete These 3 Steps</p>

      <!-- Step 1 -->
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <h3>Safety Training Test</h3>
          <p>
            You must achieve <strong>100%</strong> on the safety test before working in the lab.
            You may retake it as many times as necessary.
          </p>
          <a class="btn" href="https://forms.gle/1upAumXgFG8eFDJK7" target="_blank">Take your Safety Test →</a>
        </div>
      </div>

      <!-- Step 2 -->
      <div class="step">
        <div class="step-number">2</div>
        <div class="step-content">
          <h3>Project Approval</h3>
          <p>
            Before you start working in the lab we need to approve your project.
            Please submit the project disclosure form — include a list of the reagents and equipment
            you plan to use. We will verify that your project is compliant with our BSL-1 guidelines.
            <strong>All projects must be approved prior to beginning any work or bringing in any personal equipment.</strong>
          </p>
          <a class="btn" href="https://forms.gle/4WMkqxA68bgG6Xzf9" target="_blank">Submit Project Disclosure →</a>
        </div>
      </div>

      <!-- Step 3 -->
      <div class="step">
        <div class="step-number">3</div>
        <div class="step-content">
          <h3>Membership Agreement</h3>
          <p>
            Next time you drop by the lab in person, please sign the Membership Agreement
            on the iPad by the front door. Sign in with the name on your membership.
          </p>
          <a class="btn" href="https://drive.google.com/file/d/1TqgORtABHpDU5UKwwG-RdJWiCmW0Gr3m/" target="_blank">Preview Membership Agreement →</a>
        </div>
      </div>

      <hr class="divider" />

      <!-- Door code -->
      <div class="info-box">
        <h3>🔑 Door Code</h3>
        <p>
          Once you have completed the safety training and your project has been approved,
          you will receive an individualized door code to a key lockbox outside.
          While the door is usually unlocked during the day, the door code allows you
          and other members to access the facilities after hours.
          <strong>You must return the key immediately to the lockbox after opening the door.</strong>
        </p>
      </div>

      <!-- Note -->
      <div class="note-box">
        <p>
          <strong>Note:</strong> BioCurious provides access to equipment and minimal lab basics
          like gloves, plastic ware, and goggles. Members must however provide their own reagents!
        </p>
      </div>

      <hr class="divider" />

      <!-- Cancellation -->
      <p class="cancellation">
        <strong>Cancellation or Account Updates?</strong><br/>
        All personal items including reagents, equipment, and experiments must be cleaned up
        and moved out prior to cancellation. This also applies to short-term cancellations.
        For example, if you are going away for the summer we recommend you continue your membership —
        otherwise your supplies will need to be disposed of. Anything left at BioCurious will be
        thrown away or donated to other members after cancellation.
      </p>

      <!-- Meetup -->
      <div class="social">
        <p>Stay up to date with classes, events, and community projects:</p>
        <a href="https://www.meetup.com/BioCurious" target="_blank">Follow us on Meetup →</a>
      </div>

      <p style="font-size:14px; color:#374151; text-align:center;">
        Questions? Email us at <a href="mailto:info@biocurious.org" style="color:#10a7dd;">info@biocurious.org</a>
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>BioCurious · Silicon Valley's Community Biology Lab</p>
      <p><a href="https://biocurious.org">biocurious.org</a></p>
    </div>

  </div>
</body>
</html>
  `;

  const text = `
Hi ${firstName},

Welcome to BioCurious! You're joining a community of researchers who are eager to help you get started.

Now that you're signed up online, there are 3 steps to complete your membership:

1. SAFETY TRAINING TEST
You must achieve 100% on the safety test before working in the lab. You may retake it as many times as necessary.
Link: https://forms.gle/1upAumXgFG8eFDJK7

2. PROJECT APPROVAL
Before you start working in the lab we need to approve your project. Please submit the project disclosure form and include a list of the reagents and equipment you plan to use. All projects must be approved prior to beginning any work or bringing in any personal equipment.
Link: https://forms.gle/4WMkqxA68bgG6Xzf9

3. MEMBERSHIP AGREEMENT
Next time you drop by the lab in person, please sign the Membership Agreement on the iPad by the front door. Sign in with the name on your membership.
Preview: https://drive.google.com/file/d/1TqgORtABHpDU5UKwwG-RdJWiCmW0Gr3m/

DOOR CODE
Once you have completed the safety training and your project has been approved, you will receive an individualized door code to a key lockbox outside. You must return the key immediately to the lockbox after opening the door.

NOTE: BioCurious provides access to equipment and minimal lab basics like gloves, plastic ware, and goggles. Members must however provide their own reagents!

CANCELLATION OR ACCOUNT UPDATES?
All personal items including reagents, equipment, and experiments must be cleaned up and moved out prior to cancellation. For questions email info@biocurious.org.

Follow us on Meetup: https://www.meetup.com/BioCurious

Questions? Email us at info@biocurious.org
BioCurious · biocurious.org
  `;

  return { html, text };
}

/* ── Webhook handler ── */
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig     = event.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // only handle completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const session = stripeEvent.data.object;

  try {
    // ── Get line items to check membership type ──────────────────────────
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ['data.price'],
    });

    const purchasedIds = lineItems.data.map(li => li.price.lookup_key).filter(Boolean);
    const hasMembership = purchasedIds.some(id => MEMBERSHIP_IDS.has(id));

    if (!hasMembership) {
      console.log('No membership in this checkout — skipping welcome email.');
      return { statusCode: 200, body: 'No membership — email skipped' };
    }

    // ── Get customer details ─────────────────────────────────────────────
    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName  = session.customer_details?.name  || '';
    const firstName     = customerName.split(' ')[0] || 'there';

    if (!customerEmail) {
      console.error('No customer email found in session.');
      return { statusCode: 200, body: 'No email — skipped' };
    }

    // ── Check if this is a first-time membership ─────────────────────────
    // Look at the customer's subscriptions — if they have more than the
    // ones just created, they're an existing member
    const customer = await stripe.customers.retrieve(session.customer);
    const allSubs  = await stripe.subscriptions.list({
      customer: session.customer,
      status:   'active',
      limit:    10,
    });

    // filter to membership subscriptions only
    const membershipSubs = allSubs.data.filter(sub =>
      sub.items.data.some(si => MEMBERSHIP_IDS.has(si.price.lookup_key))
    );

    // if they have more than 1 active membership sub, they're not new
    if (membershipSubs.length > 1) {
      console.log(`Existing member ${customerEmail} — skipping welcome email.`);
      return { statusCode: 200, body: 'Existing member — email skipped' };
    }

    // ── Send welcome email ───────────────────────────────────────────────
    const { html, text } = buildWelcomeEmail(firstName);

    await transporter.sendMail({
      from:    `"BioCurious" <${process.env.GMAIL_USER}>`,
      to:      customerEmail,
      subject: 'Welcome to BioCurious — 3 steps to complete your membership 🧬',
      html,
      text,
    });

    console.log(`Welcome email sent to ${customerEmail}`);
    return { statusCode: 200, body: 'Welcome email sent' };

  } catch (err) {
    console.error('Error processing webhook:', err.message);
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};