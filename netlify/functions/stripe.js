const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

// Credit amounts per price (LIVE MODE)
const CREDITS = {
  ["price_1TRZCcREBzybwd3H9Z1rb3cN"]:  20,   // 20 credits — $1.99
  ["price_1TRZCdREBzybwd3HJkfA8MMZ"]:  60,   // 60 credits — $4.99
  ["price_1TRZCdREBzybwd3HJkfA8MMZ"]: 150,   // 150 credits — $9.99
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  const path = event.path.replace("/.netlify/functions/stripe", "");

  // ── CREATE CHECKOUT SESSION ──────────────────────────────────
  if (path === "/checkout" && event.httpMethod === "POST") {
    try {
      const { priceId, userId, userEmail } = JSON.parse(event.body);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "payment",
        success_url: "https://impromptu-practice.app?payment=success",
        cancel_url:  "https://impromptu-practice.app?payment=cancelled",
        customer_email: userEmail,
        metadata: { userId, priceId },
      });

      return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── WEBHOOK: add credits after payment ──────────────────────
  if (path === "/webhook" && event.httpMethod === "POST") {
    const sig = event.headers["stripe-signature"];
    let stripeEvent;

    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return { statusCode: 400, headers, body: `Webhook error: ${err.message}` };
    }

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const { userId, priceId } = session.metadata;
      const creditsToAdd = CREDITS[priceId] || 0;

      if (creditsToAdd > 0 && userId) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        await supabase.rpc("add_credits", { user_id: userId, amount: creditsToAdd });
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
};
