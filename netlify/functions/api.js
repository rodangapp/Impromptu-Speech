exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const { mode, topic, category, transcript, roundName, notes } = JSON.parse(event.body);
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
