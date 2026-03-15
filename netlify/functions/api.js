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
    const { mode, topic, category, transcript, roundName, notes } = body;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    let userId = null;

    if (mode !== "tournament_round") {
      const authHeader = event.headers["authorization"] || event.headers["Authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Not logged in. Please sign in to get feedback." }) };
      }

      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Session expired. Please sign in again." }) };
      }

      userId = user.id;

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
