const http = require("http");
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405); res.end(JSON.stringify({ error: "Method not allowed" })); return; }
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const { mode, topic, category, transcript, roundName, notes } = JSON.parse(body);
      let prompt;
      if (mode === "tournament_round") {
        prompt = "You are helping a student prep for impromptu speaking.\n\nCreate 30 practice topics for: " + roundName + "\n" + (notes ? "Context: " + notes + "\n" : "") + "\nReturn a JSON array of 30 strings only.";
      } else {
        prompt = "You are an expert speech coach. Give warm, specific feedback.\n\nTopic: " + topic + "\nCategory: " + category + "\nTranscript: " + (transcript || "No transcript.") + "\n\nReturn JSON: overallScore(1-10), scoreLabel, summary, strengths(3), improvements(3), structureFeedback, contentFeedback, deliveryFeedback, coachTip. No markdown.";
      }
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: mode === "tournament_round" ? 1500 : 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await response.json();
      res.writeHead(response.status);
      res.end(JSON.stringify(data));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
  });
});
server.listen(PORT, () => console.log("Backend running on port " + PORT));