# FSG Live Trainer — Handoff

A phone-friendly, **scripted (no-API-key)** voice role-play app for Sierra **SILO** HVAC techs to
practice the **Field Strategy Guide (FSG)**. Techs talk (or type) to an AI "homeowner" (Jack /
Maria / Dave), get a word-band FSG debrief, drill real objections, and log in with a personal PIN.
An admin dashboard shows who's training and for how long.

---

## 🔗 The important links

| What | Where |
|---|---|
| **Live app** | https://johnschwinghamer94-lab.github.io/fsg-trainer/ |
| **GitHub repo** (source of truth) | https://github.com/johnschwinghamer94-lab/fsg-trainer (public, branch `main`) |
| **GitHub account** | `johnschwinghamer94-lab` |
| **Git commit identity** | John Schwinghamer · johnschwinghamer94@gmail.com |

---

## 🖥️ Getting set up on the Mac

1. **Install git** (if needed): `xcode-select --install` or from git-scm.com.
2. **Clone the repo** (this is all you need — the whole app is here):
   ```bash
   git clone https://github.com/johnschwinghamer94-lab/fsg-trainer.git
   cd fsg-trainer
   ```
   First push will ask you to sign in to GitHub (browser or a personal access token).
3. **Edit** `index.html` — the ENTIRE app is this one self-contained file (HTML + CSS + JS,
   no build step, no dependencies).
4. **Test locally** (mic needs https or localhost, so run a tiny server):
   ```bash
   python3 -m http.server 8788
   # then open http://localhost:8788 in Chrome
   ```
   Opening the file directly works for typing, but the mic needs the localhost URL above.
5. **Deploy** = just push to `main`; GitHub Pages rebuilds automatically (~1 min):
   ```bash
   git add -A && git commit -m "your message" && git push
   ```
   Then on your phone hard-refresh with a cache-buster, e.g. `.../fsg-trainer/?v=12`.

> ⚠️ **GitHub Pages caps deploys at ~10 per hour.** If a deploy fails with
> *"Deployment failed, try again later,"* you hit that cap — **wait for the hour to roll over**
> (or click **Re-run failed jobs** on the run in the repo's **Actions** tab). Nothing is wrong
> with the code; the build always succeeds, only the deploy step is rate-limited.
> **Best practice: batch your edits and deploy once per session.**

> 📁 The OneDrive folder `CLAUDE STUFF/` (on the Windows PC) also holds working copies
> (`FSG Live Trainer.html`, `fsg-trainer.html`) — those are Windows artifacts. **On the Mac,
> work from the repo and edit `index.html` only.** Ignore the other two copies.

---

## 📂 Files in the repo

| File | Purpose | Status |
|---|---|---|
| `index.html` | **The whole app.** Self-contained. This is what deploys. | ✅ live |
| `.nojekyll` | Tells GitHub Pages to skip Jekyll (it's a static site). | ✅ |
| `fsg-auth-worker.js` | Optional Cloudflare Worker: team-wide accounts + usage + admin (KV storage, **no** Anthropic key). | ⏳ not deployed yet |
| `fsg-worker.js` | Optional Cloudflare Worker: **real-AI** homeowner via the Anthropic API. | ⏸️ parked (using scripted) |

---

## ⚙️ Config switches (top of the `<script>` in `index.html`)

Everything is off by default = free, local, scripted. Flip these on when ready:

| Constant | Default | What it does |
|---|---|---|
| `AI_ENDPOINT` | `""` | Set to the **`fsg-worker`** URL → homeowners become real free-thinking AI (costs pennies/session on one hidden Anthropic key). Empty = scripted engine. |
| `AUTH_ENDPOINT` | `""` | Set to the **`fsg-auth-worker`** URL → login + usage go **team-wide** (admin sees everyone). Empty = local per-device. |
| `ROSTER` | 16 SILO techs + "John (Admin)" | The sign-in name list. Mined/deduped from the transcripts. |
| `MODEL` (in `fsg-worker.js`) | `claude-opus-4-8` | Change to `claude-haiku-4-5` for ~5× cheaper/faster AI. |

---

## 🧠 How it works (so replies keep improving)

- **The app never scripts the tech.** You (the tech) speak freely. `techSays(text)` reads YOUR
  words with keyword matching, (a) sets FSG **checkpoint flags** for coaching and (b) picks the
  **homeowner's** reply. So improving "responses" = improving the customer's reactions and how
  well we recognize what the tech said.
- **Three homeowner personas** (in `SCENARIOS`): `warmair` = Jack (AC blowing warm, stressed-friendly),
  `maint` = Maria (member, warm/chatty), `noac` = Dave (system down, curt/skeptical). Each has
  `facts` (revealed when asked) + a `persona` (ack / worry / small-talk pools).
- **Objection Gym** (`OBJECTION_BANK`): real objections mined from the team's Objection Database.
  Scores each response on **empathy → ask a question → focus on helping**; rewards the SILO
  "embrace the price" move.
- **Coaching** = **word bands only** (Strong / Solid / Moderate / Weak), **never numbers**
  (SILO convention). "Coach me" scores the current tab; "End & debrief" scores the whole call.
- **Voice**: browser Web Speech API. ~3.5s pause tolerance so a breath doesn't cut you off;
  tap the mic to send. **JARVIS toggle** = British voice. iPhones fall back to typing (Safari's
  mic support is spotty).
- **Login / Admin**: pick your name → set a 4-digit PIN (keypad) → train. Admin dashboard is
  PIN-locked (separate admin PIN) and lists every tech's time / sessions / last active.
  **Local mode** (localStorage, per-device) until `AUTH_ENDPOINT` is set.

### Tuning source — real transcripts
`OneDrive - Sierra Cools LV/CLAUDE STUFF/SILO TRANSCRIPTS/<date>/*.txt` — ~1,100 real calls
(`Rep:` / `Customer:` turns, one word per line). Mine these to (a) broaden how the app recognizes
what techs say and (b) make the homeowner's replies sound like real customers. **These are NOT in
the git repo** (private + 62 MB) — they live in OneDrive. To keep sharpening replies on the Mac,
make sure that folder is available (OneDrive synced, or copy it over).

---

## 🚦 Current state

- ✅ **Live:** login + admin (local mode), scripted homeowners with transcript-tuned natural
  replies, Objection Gym, word-band coaching, voice with pause tolerance + JARVIS toggle.
- ⏸️ **Parked:** real-AI homeowners (`fsg-worker.js` written, not deployed; John chose scripted).
- ⏳ **Not deployed yet:** `fsg-auth-worker.js` — needed for the admin dashboard to show the
  **whole team** (right now the admin view is per-device).

---

## ▶️ Likely next steps (optional)

1. **Go team-wide for usage tracking:** deploy `fsg-auth-worker.js` (Cloudflare + a free KV
   namespace + an `ADMIN_PIN` secret), then set `AUTH_ENDPOINT` in `index.html`. No Anthropic key.
2. **(If ever wanted) real-AI homeowners:** deploy `fsg-worker.js` with an `ANTHROPIC_API_KEY`
   secret, set `AI_ENDPOINT`.
3. **Keep sharpening replies** from the transcripts (e.g., Objection Gym reactions, check-in and
   diagnose language).
4. **Tidy:** collapse the 3 HTML copies down to just `index.html` to avoid drift.

---

## ☁️ Deploying the Cloudflare Workers (only when you want them)

Both are **optional** and independent. Cloudflare dashboard → Workers & Pages → Create Worker →
paste the file → Deploy. Then:
- **Auth worker:** create a KV namespace, bind it as variable `USERS`, add a Secret `ADMIN_PIN`.
  Put the Worker URL in `AUTH_ENDPOINT`.
- **AI worker:** add a Secret `ANTHROPIC_API_KEY`. Put the Worker URL in `AI_ENDPOINT`.
Both lock CORS to the GitHub Pages origin. Full step-by-step comments are at the top of each file.

---

*Last updated for the Mac handoff. If you're picking this up with Claude on the Mac, point it at
this file and the repo — it has everything needed to continue.*
