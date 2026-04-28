const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const body = JSON.parse(event.body);
    const { mode, topic, category, transcript, roundName, notes, feedback, userEmail } = body;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    // ─── Auth helper ─────────────────────────────────────────────
    async function getAuthedUser() {
      const authHeader = event.headers["authorization"] || event.headers["Authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { error: { statusCode: 401, msg: "Not logged in. Please sign in to continue." } };
      }
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return { error: { statusCode: 401, msg: "Session expired. Please sign in again." } };
      }
      return { user, supabase };
    }

    // ════════════════════════════════════════════════════════════
    // MODE: delete_account
    // ════════════════════════════════════════════════════════════
    if (mode === "delete_account") {
      const auth = await getAuthedUser();
      if (auth.error) {
        return { statusCode: auth.error.statusCode, headers, body: JSON.stringify({ error: auth.error.msg }) };
      }

      const { user, supabase } = auth;

      // Delete from user_credits first (foreign key cleanup)
      await supabase.from("user_credits").delete().eq("id", user.id);

      // Then delete the auth user itself (this cascades through Supabase)
      const { error: deleteErr } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteErr) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not delete account: " + deleteErr.message }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: "Account deleted" }) };
    }

    // ════════════════════════════════════════════════════════════
    // MODE: email_transcript
    // ════════════════════════════════════════════════════════════
    if (mode === "email_transcript") {
      const auth = await getAuthedUser();
      if (auth.error) {
        return { statusCode: auth.error.statusCode, headers, body: JSON.stringify({ error: auth.error.msg }) };
      }

      const { user } = auth;
      const recipientEmail = userEmail || user.email;

      if (!RESEND_API_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Email service not configured" }) };
      }

      if (!feedback || !transcript) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing feedback or transcript" }) };
      }

      // Build a nicely formatted HTML email
      const safeTranscript = String(transcript || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const score = feedback.overallScore || 0;
      const scoreColor = score >= 8 ? "#16a34a" : score >= 6 ? "#f97316" : "#ef4444";

      const strengthsHtml = (feedback.strengths || []).map(s =>
        `<li style="margin-bottom:8px;color:#1a1a2e">${String(s).replace(/</g, "&lt;")}</li>`
      ).join("");

      const improvementsHtml = (feedback.improvements || []).map(s =>
        `<li style="margin-bottom:8px;color:#1a1a2e">${String(s).replace(/</g, "&lt;")}</li>`
      ).join("");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#faf8f4;margin:0;padding:24px;color:#1a1a2e">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">

    <div style="text-align:center;margin-bottom:28px">
      <div style="font-size:24px;font-weight:800;color:#f97316;margin-bottom:4px">Impromptu Coach</div>
      <div style="font-size:13px;color:#94a3b8">Your speech transcript &amp; AI feedback</div>
    </div>

    <div style="border-top:1px solid #e2e8f0;padding-top:24px;margin-bottom:24px">
      <div style="font-size:11px;color:#94a3b8;letter-spacing:1px;font-weight:600;margin-bottom:6px">CATEGORY</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:14px">${String(category || "").replace(/</g, "&lt;")}</div>
      <div style="font-size:11px;color:#94a3b8;letter-spacing:1px;font-weight:600;margin-bottom:6px">TOPIC</div>
      <div style="font-size:16px;font-weight:600;line-height:1.5;color:#1a1a2e;margin-bottom:0">${String(topic || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="background:#f8fafc;border-radius:14px;padding:20px;margin-bottom:24px">
      <div style="font-size:11px;color:#94a3b8;letter-spacing:1px;font-weight:600;margin-bottom:10px">YOUR TRANSCRIPT</div>
      <div style="font-size:15px;line-height:1.7;color:#334155;white-space:pre-wrap">${safeTranscript}</div>
    </div>

    <div style="text-align:center;background:white;border:1.5px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:20px">
      <div style="font-size:60px;font-weight:800;color:${scoreColor};line-height:1">${score}</div>
      <div style="color:#94a3b8;font-size:13px;margin-bottom:6px">out of 10</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:10px">${String(feedback.scoreLabel || "").replace(/</g, "&lt;")}</div>
      <div style="color:#64748b;font-size:14px;line-height:1.7">${String(feedback.summary || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:18px;margin-bottom:14px">
      <div style="font-weight:700;font-size:11px;color:#16a34a;letter-spacing:1px;margin-bottom:10px">💪 STRENGTHS</div>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">${strengthsHtml}</ul>
    </div>

    <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:14px;padding:18px;margin-bottom:14px">
      <div style="font-weight:700;font-size:11px;color:#f97316;letter-spacing:1px;margin-bottom:10px">🎯 IMPROVE</div>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">${improvementsHtml}</ul>
    </div>

    <div style="background:white;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-weight:700;font-size:10px;color:#64748b;letter-spacing:1px;margin-bottom:6px">📐 STRUCTURE</div>
      <div style="font-size:14px;line-height:1.7">${String(feedback.structureFeedback || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="background:white;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-weight:700;font-size:10px;color:#64748b;letter-spacing:1px;margin-bottom:6px">💡 CONTENT</div>
      <div style="font-size:14px;line-height:1.7">${String(feedback.contentFeedback || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="background:white;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-weight:700;font-size:10px;color:#64748b;letter-spacing:1px;margin-bottom:6px">🗣️ DELIVERY</div>
      <div style="font-size:14px;line-height:1.7">${String(feedback.deliveryFeedback || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="background:linear-gradient(135deg,#fff8f3,white);border:2px solid #f97316;border-radius:14px;padding:20px;margin-bottom:24px">
      <div style="font-weight:700;font-size:11px;color:#f97316;letter-spacing:1px;margin-bottom:8px">⭐ COACH'S GOLDEN TIP</div>
      <div style="font-size:15px;line-height:1.7;font-style:italic">${String(feedback.coachTip || "").replace(/</g, "&lt;")}</div>
    </div>

    <div style="text-align:center;padding-top:20px;border-top:1px solid #e2e8f0">
      <a href="https://impromptu-practice.app" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">Practice Again</a>
      <div style="font-size:12px;color:#94a3b8;margin-top:20px">A Rodano Labs App  ·  rodanolabs.com</div>
    </div>

  </div>
</body>
</html>`;

      // Send via Resend
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + RESEND_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Impromptu Coach <hello@rodanolabs.com>",
          to: [recipientEmail],
          subject: `Your speech transcript: ${String(topic || "").substring(0, 80)}`,
          html
        })
      });

      if (!resendResponse.ok) {
        const errData = await resendResponse.json().catch(() => ({}));
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: errData.message || "Could not send email" })
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ════════════════════════════════════════════════════════════
    // MODE: tournament_round (no auth, no credit deduction)
    // ════════════════════════════════════════════════════════════
    let userId = null;

    if (mode !== "tournament_round") {
      const auth = await getAuthedUser();
      if (auth.error) {
        return { statusCode: auth.error.statusCode, headers, body: JSON.stringify({ error: auth.error.msg }) };
      }

      userId = auth.user.id;
      const supabase = auth.supabase;

      const { data: creditRow, error: creditError } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("id", userId)
        .single();

      if (creditError || !creditRow) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Could not find your account. Please sign out and back in." }) };
      }

      if (creditRow.credits <= 0) {
        return { statusCode: 402, headers, body: JSON.stringify({ error: "no_credits", message: "You're out of credits. Purchase more to continue." }) };
      }
    }

    // ════════════════════════════════════════════════════════════
    // MODE: feedback / tournament_round → call Anthropic
    // ════════════════════════════════════════════════════════════
    let prompt, maxTokens;

    if (mode === "tournament_round") {
      maxTokens = 1500;
      prompt = `You are a speech coach.\n\nCreate 30 practice topics for an impromptu speaking competition round.\nRound theme: ${roundName}\n${notes ? "Notes: " + notes + "\n" : ""}\nReturn ONLY a raw JSON array of 30 strings. No markdown. Start with [ end with ].`;
    } else {
      maxTokens = 1000;
      prompt = `Expert speech coach feedback. Be warm and specific.\n\nTopic: ${topic}\nCategory: ${category}\nTranscript: ${transcript || "No transcript."}\n\nReturn ONLY JSON (no markdown): overallScore(1-10), scoreLabel, summary, strengths(3), improvements(3), structureFeedback, contentFeedback, deliveryFeedback, coachTip.`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
    });

    const data = await response.json();

    if (mode !== "tournament_round" && userId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await supabase.rpc("deduct_credit", { user_id: userId });
    }

    return { statusCode: response.status, headers, body: JSON.stringify(data) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
