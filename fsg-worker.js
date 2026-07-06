/**
 * FSG Live Trainer — AI proxy (Cloudflare Worker)
 * ------------------------------------------------
 * Holds ONE hidden Anthropic API key for the whole team.
 * The phone app POSTs the conversation here; this Worker builds the
 * homeowner's system prompt server-side and calls Claude, so the key is
 * never exposed and the endpoint can't be used as a general-purpose Claude.
 *
 * Deploy: Cloudflare dashboard → Workers → Create → paste this file.
 * Then add a Secret named  ANTHROPIC_API_KEY  (your sk-ant-... key).
 */

// ---- Config ----------------------------------------------------------------
const MODEL = "claude-opus-4-8";   // to cut cost/latency ~5x, change to "claude-haiku-4-5"
const MAX_TOKENS = 220;             // homeowner replies are short (voice)
const MAX_TURNS = 40;               // clamp history to control cost
// Lock the browser origin that may call this Worker (your GitHub Pages site).
const ALLOWED_ORIGINS = [
  "https://johnschwinghamer94-lab.github.io",
  "http://127.0.0.1:8788",
  "http://localhost:8788"
];

// ---- Scenario personas (mirror the app) ------------------------------------
const SCENARIOS = {
  warmair: {
    name: "Jack", type: "service",
    scene: "It's a hot afternoon. Your air conditioner is blowing warm air. A technician from Sierra Air Conditioning has just arrived at your door.",
    persona: "You're friendly but a little stressed and hot. You want it fixed today. You are NOT currently a member.",
    facts: "Lived here about 3 years (bought it then), staying long-term. You forget to change filters (every few months). The upstairs office gets much hotter than the rest of the house. You keep it around 72 in summer. Power bill has crept up to about $280. It was fine this morning but hot when you got home from work; first real problem you've had with it."
  },
  maint: {
    name: "Maria", type: "maintenance",
    scene: "A technician from Sierra is here for your scheduled summer maintenance/tune-up. Everything's been running fine.",
    persona: "You're warm, chatty, and a loyal longtime member. Relaxed and in a good mood.",
    facts: "Lived here 12 years (bought new), staying forever. Sierra brings your filters. Back bedroom runs a couple degrees warmer. You like 74 in summer, 68 in winter. Summer bill about $190. No issues since the last visit; Sierra replaced a capacitor a couple years ago. You ARE a member and have been for years."
  },
  noac: {
    name: "Dave", type: "service",
    scene: "Your system is completely down and it's 85 degrees upstairs. A technician from Sierra is at your door. You're hot and a little short.",
    persona: "You're curt, guarded, and price-sensitive. A previous company oversold you last year, so you're skeptical of contractors. You do NOT want to be pitched a whole new system.",
    facts: "Lived here about 8 years (bought it then). Not sure how long you'll stay, maybe a few more years. You change the filter when you remember. Upstairs is an oven; downstairs isn't much better right now. Usually keep it at 70; right now it says 85 and climbing. Bills already feel too high. It died overnight — you woke up sweating. You are NOT a member."
  }
};

const DIFF = {
  easy:  "EASY: You're warm and agreeable. Raise objections only rarely. Give the tech an easy time.",
  real:  "REALISTIC: A normal customer. Some natural pushback and a few questions. Occasionally raise a realistic objection.",
  tough: "TOUGH: You're skeptical and price-sensitive. Test the technician. Raise real objections often, especially about price and spending money on an old system."
};

// Real objection flavors the team actually hears — the model can draw on these.
const OBJECTIONS = "Real objections to weave in when the tech shows prices or options (only when it fits): \"Gosh, that's a big number.\" / \"I need to talk to my wife/husband first.\" / \"I want to think about it.\" / \"I'll get a couple other quotes.\" / \"I have a home warranty.\" / \"For that money I might as well replace the whole unit.\" / \"That's a lot for an old system.\"";

function buildSystem(scenarioId, difficultyId) {
  const s = SCENARIOS[scenarioId] || SCENARIOS.warmair;
  const d = DIFF[difficultyId] || DIFF.real;
  return [
    `You are role-playing as ${s.name}, a homeowner, in a live voice training simulation for HVAC service technicians who are practicing the Sierra SILO "Field Strategy Guide" (FSG) sales process. The trainee is the technician talking to you.`,
    ``,
    `SITUATION: ${s.scene}`,
    `WHO YOU ARE: ${s.persona}`,
    `FACTS ABOUT YOUR HOME & SYSTEM (reveal these ONLY when the technician actually asks — never dump them all at once): ${s.facts}`,
    ``,
    `DIFFICULTY — ${d}`,
    ``,
    `HOW TO PLAY IT:`,
    `- Stay 100% in character as ${s.name}. NEVER say you are an AI, a bot, or a simulation. Never coach, grade, or explain the FSG. You are just the homeowner.`,
    `- Keep every reply SHORT and natural — 1 to 3 sentences, the way a real person speaks out loud. This is voice; be conversational, not formal.`,
    `- React realistically to what the technician does. When they do the right things — introduce themselves, ask permission to come in, wear floor protection, show empathy, ask good questions, explain things simply, show you pictures, get you to see the problem, set clear expectations, present clear options — warm up and engage. If they're pushy, jargon-heavy, skip steps, or talk down to you, get more guarded.`,
    `- You are a homeowner, not a technician: never use HVAC jargon yourself (no "capacitor", "amps", "SEER"). If they confuse you with jargon, say you don't follow.`,
    `- Only answer what's asked. Don't volunteer your whole life story.`,
    `- ${OBJECTIONS}`,
    `- Don't narrate stage directions in asterisks unless the technician did first; just talk.`,
    ``,
    `Respond only as ${s.name}, reacting to the technician's latest message.`
  ].join("\n");
}

// ---- HTTP handling ---------------------------------------------------------
function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "content-type": "application/json" };

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST")
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers }); }

    const scenario = String(body.scenario || "warmair");
    const difficulty = String(body.difficulty || "real");
    let messages = Array.isArray(body.messages) ? body.messages : [];

    // sanitize + clamp history (keeps cost bounded, prevents key abuse)
    messages = messages
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!messages.length || messages[0].role !== "user")
      return new Response(JSON.stringify({ error: "need a user turn" }), { status: 400, headers });

    const system = buildSystem(scenario, difficulty);

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages })
      });
      const data = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: (data.error && data.error.message) || "api error" }),
          { status: 502, headers });
      }
      // stop_reason "refusal" → empty/blocked; fall through to a safe line
      let reply = "";
      if (Array.isArray(data.content))
        reply = data.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
      if (!reply) reply = "Sorry, could you say that again?";
      return new Response(JSON.stringify({ reply }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: "proxy failure" }), { status: 502, headers });
    }
  }
};
