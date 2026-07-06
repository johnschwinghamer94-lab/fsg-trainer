/**
 * FSG Live Trainer — Accounts & Usage backend (Cloudflare Worker)
 * ---------------------------------------------------------------
 * Gives the whole team ONE shared place for tech PINs + usage time so the
 * admin can see who's training and how long. Does NOT use any Anthropic key.
 *
 * Setup (Cloudflare dashboard):
 *  1. Workers & Pages → Create Worker → paste this file → Deploy.
 *  2. Create a KV namespace (Storage & Databases → KV → Create) called  USERS.
 *  3. Worker → Settings → Bindings → add KV namespace: Variable name  USERS  → your namespace.
 *  4. Worker → Settings → Variables and Secrets → add Secret  ADMIN_PIN  = your admin PIN.
 *  5. Copy the Worker URL and put it in AUTH_ENDPOINT in the trainer HTML.
 */

const SALT = "fsg-silo-2026";
const ALLOWED_ORIGINS = [
  "https://johnschwinghamer94-lab.github.io",
  "http://127.0.0.1:8788",
  "http://localhost:8788"
];

function cors(origin){
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400"
  };
}
async function sha(s){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + ":" + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const keyFor = name => "user:" + name.trim().toLowerCase();
const clampPin = p => String(p || "").replace(/\D/g, "").slice(0, 6);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "content-type": "application/json" };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST")
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    let body = {};
    try { body = await request.json(); } catch {}
    const name = (body.name || "").toString().trim();

    try {
      // ---- does this tech already have a PIN? ----
      if (path.endsWith("/status")) {
        if (!name) return j({ error: "no name" }, 400, headers);
        const rec = await env.USERS.get(keyFor(name));
        return j({ exists: !!rec }, 200, headers);
      }

      // ---- first-time: create a PIN ----
      if (path.endsWith("/register")) {
        const pin = clampPin(body.pin);
        if (!name || pin.length < 4) return j({ error: "need name + 4-digit PIN" }, 400, headers);
        if (await env.USERS.get(keyFor(name))) return j({ error: "account exists" }, 409, headers);
        const rec = { name, pinHash: await sha(pin), createdAt: Date.now(), lastActive: Date.now(), totalSeconds: 0, sessions: 1 };
        await env.USERS.put(keyFor(name), JSON.stringify(rec));
        return j({ ok: true }, 200, headers);
      }

      // ---- returning: verify PIN ----
      if (path.endsWith("/login")) {
        const pin = clampPin(body.pin);
        const raw = await env.USERS.get(keyFor(name));
        if (!raw) return j({ error: "no account" }, 404, headers);
        const rec = JSON.parse(raw);
        if (rec.pinHash !== await sha(pin)) return j({ error: "wrong PIN" }, 401, headers);
        rec.lastActive = Date.now(); rec.sessions = (rec.sessions || 0) + 1;
        await env.USERS.put(keyFor(name), JSON.stringify(rec));
        return j({ ok: true }, 200, headers);
      }

      // ---- log usage time (seconds since last heartbeat) ----
      if (path.endsWith("/heartbeat")) {
        const secs = Math.max(0, Math.min(3600, Math.round(Number(body.seconds) || 0)));
        const raw = await env.USERS.get(keyFor(name));
        if (!raw) return j({ error: "no account" }, 404, headers);
        const rec = JSON.parse(raw);
        rec.totalSeconds = (rec.totalSeconds || 0) + secs;
        rec.lastActive = Date.now();
        await env.USERS.put(keyFor(name), JSON.stringify(rec));
        return j({ ok: true, totalSeconds: rec.totalSeconds }, 200, headers);
      }

      // ---- admin: list everyone's usage (PIN-locked) ----
      if (path.endsWith("/admin")) {
        const adminPin = clampPin(body.adminPin);
        if (!adminPin || adminPin !== clampPin(env.ADMIN_PIN))
          return j({ error: "wrong admin PIN" }, 401, headers);
        const list = await env.USERS.list({ prefix: "user:" });
        const users = [];
        for (const k of list.keys) {
          const raw = await env.USERS.get(k.name);
          if (!raw) continue;
          const r = JSON.parse(raw);
          users.push({ name: r.name, totalSeconds: r.totalSeconds || 0, lastActive: r.lastActive || 0, createdAt: r.createdAt || 0, sessions: r.sessions || 0 });
        }
        users.sort((a, b) => b.totalSeconds - a.totalSeconds);
        return j({ users }, 200, headers);
      }

      return j({ error: "unknown endpoint" }, 404, headers);
    } catch (e) {
      return j({ error: "server error" }, 500, headers);
    }
  }
};

function j(obj, status, headers){ return new Response(JSON.stringify(obj), { status, headers }); }
