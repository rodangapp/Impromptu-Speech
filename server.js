const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method === "GET") {
    const htmlPath = path.join(__dirname, "app.html");
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(htmlPath));
    } else { res.writeHead(404); res.end("App not deployed yet"); }
    return;
  }
  if (req.method !== "POST") { res.writeHead(405); res.end(JSON.stringify({ error: "Method not allowed" })); return; }
  res.setHeader("Content-Type", "application/json");
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const { mode, topic, category, transcript, roundName, notes } = JSON.parse(body);
      let prompt, maxTokens;
      if (mode === "tournament_round") {
        maxTokens = 1500;
        prompt = "You are a speech coach.\n\nCreate 30 practice topics for an impromptu speaking competition round.\nRound theme: " + roundName + "\n" + (notes ? "Notes: " + notes + "\n" : "") + "\nReturn ONLY a raw JSON array of 30 strings. No markdown. Start with [ end with ].";
      } else {
        maxTokens = 1000;
        prompt = "Expert speech coach feedback. Be warm and specific.\n\nTopic: " + topic + "\nCategory: " + category + "\nTranscript: " + (transcript || "No transcript.") + "\n\nReturn ONLY JSON (no markdown): overallScore(1-10), scoreLabel, summary, strengths(3), improvements(3), structureFeedback, contentFeedback, deliveryFeedback, coachTip.";
      }
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
      });
      const data = await response.json();
      res.writeHead(response.status);
      res.end(JSON.stringify(data));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
  });
});
server.listen(PORT, () => console.log("Running on port " + PORT));