# Louay & Ameni — Realtime Marriage Contract App
## Full Technical Specification

This document describes everything needed to take the prototype (`marriage-contract.jsx`) and turn it into a robust, production-grade realtime signing experience. It covers architecture, tech stack choices, data models, every module in the app, the realtime protocol, security, and a build roadmap.

---

## 1. What the product actually is

A two-person, session-based web app where:
- Each person identifies as "Louay" or "Ameni" (no public signup).
- Both view the same styled marriage-contract document.
- Each has their own signature pad; the other side sees the pen strokes appear live as they're drawn.
- Either side can send short chat messages that pop up as toasts on the other's screen instantly.
- Once both sign, the contract "seals" with a timestamp, becoming read-only.

There are two possible builds, in increasing order of robustness:

| Tier | Sync method | Persistence | Works after both browsers close? |
|---|---|---|---|
| **Prototype (current)** | Polling a shared key-value store (Claude artifact storage) | Until keys are cleared | No — not a real DB |
| **Production** | WebSocket server + real database | Permanent | Yes |

This doc covers both, but focuses on the production tier since that's what "perfectly" implies.

---

## 2. Tech stack

### Frontend
- **Framework:** React 18 (Vite as the build tool — faster dev server and smaller bundle than CRA)
- **Styling:** Plain CSS-in-JS objects (as in the prototype) or Tailwind CSS if you want utility classes; either works, don't need both
- **Canvas drawing:** native `<canvas>` + Pointer Events API (`pointerdown/move/up`), which unifies mouse + touch + stylus input (better than separate mouse/touch handlers used in the prototype)
- **Realtime client:** `socket.io-client` (or plain native `WebSocket` if you don't need fallback transports)
- **State sync helper:** small custom store (React Context + `useReducer`) or Zustand — avoids prop-drilling presence/signature/chat state through the tree
- **Fonts:** Google Fonts — Playfair Display (headline), EB Garamond (document body), Inter (UI chrome)

### Backend — fully self-hosted, no third-party cloud services
- **Runtime:** Node.js (LTS), running on your own machine, home server, VPS, or a Raspberry Pi — anything you control
- **Realtime transport:** `socket.io` server, self-hosted in the same Node process as the REST API. Handles reconnection, rooms, and fallback transports natively — no managed realtime service needed
- **Database:** PostgreSQL, running locally via Docker (or installed directly on the host) — no cloud DB
- **File storage:** local disk (a `storage/` folder on the server) for exported signature PNGs and final PDFs — no S3/cloud bucket
- **Auth:** no external auth provider — a simple **per-person secret token** (see §6), generated locally and embedded in each person's link, checked against the local Postgres row
- **Reverse proxy / TLS:** Caddy or Nginx running alongside, so the app is served over HTTPS even though everything lives on hardware you own (Caddy auto-issues Let's Encrypt certs if the server has a public domain, or you can use a self-signed cert / mkcert for LAN-only use)
- **Hosting:** everything above packaged together with **Docker Compose** on one machine — no Vercel, no Supabase, no Firebase, nothing leaves your network unless you choose to expose a port

### Recommended self-hosted stack
```
Frontend:      React + Vite, built as static files, served by Nginx/Caddy
Backend:       Node.js + Express + Socket.IO (one process)
Database:      PostgreSQL (Docker container, local volume)
File storage:  local disk volume (./storage/signatures, ./storage/pdfs)
Reverse proxy: Caddy (auto HTTPS) or Nginx (manual cert)
Auth:          per-person random token in the URL, validated against Postgres
Packaging:     docker-compose.yml running all of the above on one host
```
Nothing here depends on an internet service being up — if your home server or VPS is running, the app works. You can run it entirely on a laptop on your own LAN for a same-house test, or on a small VPS (e.g. a €5/month box) if Louay and Ameni are in different locations and need to reach it over the internet.

---

## 3. High-level architecture

```
 ┌────────────┐        WebSocket / Realtime channel        ┌────────────┐
 │  Louay's   │ ───────────────────────────────────────────▶│  Ameni's   │
 │  Browser   │◀──────────────────────────────────────────── │  Browser   │
 └─────┬──────┘                                              └─────┬──────┘
       │                                                           │
       │              REST calls (load contract, save final PDF)  │
       ▼                                                           ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │         Your own server (home box / VPS / Raspberry Pi)          │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  Caddy / Nginx  →  HTTPS, serves static frontend build      │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  Node.js (Express + Socket.IO) — single process              │  │
 │  │   - contracts table (Postgres)                                │  │
 │  │   - messages table (Postgres)                                 │  │
 │  │   - presence + stroke events (in-memory / ephemeral)           │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  PostgreSQL (Docker container, local volume)                  │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  Local disk: ./storage/signatures, ./storage/pdfs             │  │
 │  └───────────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────┘
```
Everything is one `docker-compose up` away — no external accounts, no third-party dashboards, no data leaving the box unless you deliberately expose it.

Two data classes matter for design:
1. **Ephemeral/realtime data** (live pen position, "is typing," presence) — never touches disk, just broadcast to the other client.
2. **Durable data** (finished signature image, chat log, seal timestamps) — written to the database so the contract exists after everyone closes their laptop.

---

## 4. Data model

### `contracts` table
| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| party_a_name | text | "Louay" |
| party_b_name | text | "Ameni" |
| party_a_token | text | secret URL token, acts as that person's login |
| party_b_token | text | secret URL token |
| party_a_sealed_at | timestamptz \| null | |
| party_b_sealed_at | timestamptz \| null | |
| party_a_signature_url | text \| null | final PNG in storage bucket |
| party_b_signature_url | text \| null | |
| created_at | timestamptz | |

### `messages` table
| column | type |
|---|---|
| id | uuid |
| contract_id | uuid (FK) |
| sender | text ("party_a" / "party_b") |
| body | text |
| created_at | timestamptz |

### Realtime-only channel payloads (not stored as rows)
```ts
// stroke event, broadcast while drawing
{
  type: "stroke_point",
  party: "party_a",
  strokeId: "uuid",
  point: { x: number, y: number, t: number },
  final: boolean // true on pointerup
}

// presence event
{
  type: "presence",
  party: "party_a",
  status: "online" | "signing" | "idle",
  lastSeen: number
}
```

---

## 5. Realtime protocol — the important part

### 5.1 Why polling isn't "real" realtime
The prototype polls a shared key every ~1.1s. That's simple and needs no server, but:
- Adds up to ~1s of visible lag
- Wastes bandwidth (constant GET requests even when nothing changed)
- Doesn't scale if this pattern were reused for many users

A real implementation uses a **push-based channel**: your self-hosted Socket.IO server pushes events to connected clients the instant something happens, over a persistent WebSocket connection it manages itself — no external realtime service involved. Latency drops to ~50–150ms (network round trip only), or even less on a LAN.

### 5.2 Recommended channel design
Use **one realtime "room" per contract**, e.g. channel name `contract:{contract_id}`. Both browsers subscribe to it on load.

Event types on this channel:
| event | payload | frequency |
|---|---|---|
| `presence_join` / `presence_leave` | party id | on connect/disconnect |
| `presence_update` | `{party, status}` | on signing start/stop, throttled to 1/sec |
| `stroke_point` | `{party, strokeId, x, y, final}` | streamed while drawing, ~40–60 events/sec via `requestAnimationFrame`-throttled emit, or batched every 16–50ms |
| `stroke_clear` | `{party}` | when someone clears their pad before sealing |
| `message_new` | `{sender, body, ts}` | on send |
| `seal` | `{party, signatureUrl, sealedAt}` | on final seal — this one **is** persisted |

### 5.3 Drawing sync in detail
This is the "live signing" feature, so it deserves precision:

1. **Local drawing is instant** — the signer's own canvas draws immediately from local pointer events; never wait on network round-trip for your own hand.
2. **Throttled broadcast** — as the pointer moves, batch points into small arrays and emit every ~30–50ms (not every single `pointermove`, which can fire 100+/sec and flood the channel).
3. **Remote interpolation** — the receiving client gets sparse points and should draw smooth curves between them (quadratic Bézier interpolation between consecutive points looks natural; a simple `lineTo` per point is fine too and is what the prototype does).
4. **Stroke completion** — on `pointerup`, emit a `final: true` stroke_point so the remote side knows to close that path segment and start expecting a new `strokeId` next.
5. **Reconnection catch-up** — if Ameni's browser disconnects mid-signature and reconnects, it needs the *current full stroke state*, not just new deltas. Solve this by keeping the in-progress signature (not yet sealed) in a small in-memory cache on your Node server, keyed by contract id + party. On `socket.io` reconnect (the library's built-in `reconnect` event), the client requests a one-time `get_current_strokes` snapshot from the server, applies it, then resumes listening to the live stream.

### 5.4 Presence details
- Heartbeat: client sends `presence_update` every ~2–3s while tab is open. Socket.IO also fires a native `disconnect` event on the server the moment a socket drops, so you get "offline" instantly on disconnect and don't have to wait out a heartbeat timeout for that case — only use the heartbeat timeout to catch silently-frozen tabs.
- Mark someone "signing" the instant a `pointerdown` happens on their own pad, "online" otherwise, and "offline" when heartbeat/socket is gone for >6s.

### 5.5 Chat/message popups
- On send: in the same Socket.IO handler, write the message row to your local Postgres via a single `INSERT`, then immediately `io.to(room).emit('message_new', payload)` — one code path does both, no separate trigger system needed.
- Receiving client: show a toast (auto-dismiss ~4–5s) AND append to a persistent scrollable log — the prototype already does both.
- Consider **read receipts** ("seen by Ameni") for a nice touch: a `messages.seen_at` column updated when the recipient's chat panel is open and message is visible.

---

## 6. Identity & access (no full auth system, nothing external)

Since there are exactly two users, avoid building a whole login system or wiring up an external identity provider:
- On contract creation, a small local script (or an admin route you run once) generates two unique, unguessable tokens using Node's built-in `crypto.randomBytes(24).toString('hex')` — no external ID service.
- These get embedded in each person's link, e.g.:
  `https://your-server-or-lan-ip/c/{contract_id}?as=louay&key={secret_token_a}`
  `https://your-server-or-lan-ip/c/{contract_id}?as=ameni&key={secret_token_b}`
- You send each link to that person yourself (in person, over an existing trusted chat, etc.) — there's no email/SMS provider involved.
- The Node server validates the token against the local Postgres row before letting that socket join the room and before accepting any writes claiming to be that party — **never trust the `as=` query param alone**, or one person could impersonate the other by editing the URL.
- If both people are on the same home network, you can skip HTTPS entirely and just use the server's LAN IP (e.g. `http://192.168.1.42:3000/...`) — fine for a private, same-household test.

---

## 7. Frontend module breakdown

```
src/
  main.jsx                  – app entry, mounts <App/>
  App.jsx                   – routes: /gate, /:contractId
  contexts/
    ContractContext.jsx      – provides realtime connection, contract state, dispatch
  hooks/
    useRealtimeChannel.js    – wraps socket.io / Supabase channel subscribe+cleanup
    usePresence.js           – tracks self + other presence status
    useSignaturePad.js       – encapsulates canvas drawing + stroke emit/receive logic
    useChat.js               – message list + send + toast trigger
  components/
    RoleGate.jsx              – "I am Louay / I am Ameni" + token validation
    TopBar.jsx                – presence pill, online dot
    ContractDocument.jsx      – the styled paper, contract text, seal banner
    SignaturePad.jsx          – canvas component (editable + read-only remote mode)
    SealButton.jsx            – seal action, disabled until signature non-empty
    ChatWidget.jsx             – floating button + panel + input
    Toast.jsx                  – popup message notification
  lib/
    realtimeClient.js          – socket/channel setup, single shared instance
    api.js                     – REST calls: fetch contract, post final seal, export PDF
  styles/
    tokens.js                  – palette/type constants (see design tokens below)
```

### Design tokens (carried over from the prototype, keep consistent)
```
Colors:
  parchment  #EFE7D5   – page background
  paper      #FFFDF7   – document card
  ink        #2B2A28   – body text
  wine       #7A1F2B   – Louay's accent / primary buttons
  sage       #5C6B4F   – Ameni's accent
  gold       #B08D57   – ornamental accents, seal

Type:
  Headline: 'Playfair Display' (500/700, italic for accents)
  Document body: 'EB Garamond'
  UI chrome (buttons, labels, chat): 'Inter'
```

---

## 8. Backend module breakdown (if self-hosting instead of Supabase)

```
server/
  index.js               – Express/Fastify app + Socket.IO attach
  routes/
    contracts.js          – GET /contracts/:id (validates token), POST /contracts/:id/seal
    messages.js           – GET history (initial load), POST fallback if not using sockets for writes
  sockets/
    roomHandlers.js        – join room, validate token, broadcast presence/stroke/message events
  db/
    schema.sql              – tables from §4
    client.js                – pg client / ORM (Prisma recommended)
  services/
    exportPdf.js              – renders final sealed contract (with baked-in signature images) to PDF using a headless-browser tool or a PDF library, stores in bucket
```

---

## 9. Sealing & document finalization

1. When a party clicks "Seal," the client:
   - Stops accepting further strokes on that pad
   - Renders the canvas to a PNG (`canvas.toDataURL('image/png')`)
   - Uploads the PNG to storage, gets a URL
   - Calls `POST /contracts/:id/seal` with `{party, signatureUrl}`
2. Server marks `party_x_sealed_at = now()`, broadcasts `seal` event.
3. When **both** are sealed, server (or a client that notices both are sealed) triggers PDF generation:
   - Render the same contract HTML with both signature images baked in as `<img>` tags, print to PDF locally using **Puppeteer** (`page.pdf()`) — it runs a headless Chromium instance right there in your Node process, no external rendering service needed
   - Save the PDF straight to `./storage/pdfs/{contract_id}.pdf` on local disk, store that relative path on the contract row
4. Both clients get a `contract_finalized` event with the PDF URL and show a "Download your signed contract" button.

---

## 10. Security & privacy notes

- **Token-based access**, not public IDs — contract URLs must be unguessable (use a cryptographically random 32-char token, not the DB's sequential id, in the shareable link).
- **Never trust client-declared identity** — every socket message must be checked server-side against the token that authenticated that connection, not a `party` field the client could fake.
- **Rate-limit stroke events and messages** per socket to prevent abuse/flooding.
- **HTTPS/WSS only.**
- This system is a **ceremonial/keepsake document, not a legally binding e-signature** unless you integrate a real e-signature compliance provider (e.g. DocuSign API, which handles legal audit trails, identity verification, and jurisdictional compliance — well beyond this app's scope). Say this explicitly in the UI footer if it matters to you.

---

## 11. Realtime latency & UX polish details

- Debounce presence "signing" flips so quick pauses mid-signature don't flicker the status text.
- Use `requestAnimationFrame` for local canvas rendering so drawing feels smooth regardless of network activity.
- On the remote side, if no new stroke point arrives for >2s during an active stroke, assume the sender paused (not disconnected) — don't show a broken/incomplete line, just wait.
- Add a subtle ink-flow animation on the wax seal when both parties finish, as the one deliberate "moment" of motion (per the app's restrained design language) — avoid extra hover/entrance animations elsewhere.
- Mobile: make signature pads full-width, stack them vertically instead of the two-column grid, and prefer Pointer Events for correct touch + stylus pressure handling.

---

## 12. Docker Compose — the whole self-hosted stack in one file

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: contract
      POSTGRES_PASSWORD: change_me_locally
      POSTGRES_DB: marriage_contract
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"   # only exposed on localhost, not the internet

  app:
    build: ./server         # Node + Express + Socket.IO + Puppeteer
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgres://contract:change_me_locally@postgres:5432/marriage_contract
      STORAGE_DIR: /data/storage
    volumes:
      - ./storage:/data/storage   # signatures + PDFs persist on your own disk
    ports:
      - "3000:3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  pgdata:
  caddy_data:
```

A minimal `Caddyfile` for a home server with a domain pointed at it:
```
yourdomain.com {
  reverse_proxy app:3000
}
```
For LAN-only use (no domain), skip Caddy and just hit `http://<server-lan-ip>:3000` directly, or use Caddy with `tls internal` for a self-signed cert.

Bring the whole thing up with:
```
docker compose up -d
```
Everything — web server, realtime socket layer, database, and file storage — runs on hardware you control.

---

## 13. Suggested build order

1. Static contract UI (no realtime) — get the paper design, layout, fonts right.
2. Local-only signature pad (drawing works, nothing synced).
3. Stand up the Docker Compose stack: Postgres + Node app skeleton, confirm `docker compose up` works end to end.
4. Add the `contracts` + `messages` tables and the token-based access check (§6).
5. Wire the self-hosted Socket.IO channel: presence first (simplest), then chat messages, then stroke streaming (hardest, most event-heavy).
6. Add seal flow + local Puppeteer PDF export, written to `./storage/pdfs`.
7. Polish: toasts, reconnect handling, mobile layout, rate limiting.
8. (Optional) Add a "guest viewer" read-only link for witnesses/family to watch the signing live without being able to draw — same token mechanism, just a read-only flag on that token's row.

---

## 14. Summary

The prototype already proves the concept end-to-end using polling, which is fine for a private demo between two people on the same page. The path to a "perfect," fully self-hosted version is:
**swap polling for a push channel via your own Socket.IO server**, **add a local Postgres database (Docker) so the contract survives after the tab closes**, **secure identity with per-person random tokens instead of a name button**, **store signatures and PDFs on local disk**, and **generate the final PDF locally with Puppeteer** — all packaged in one `docker-compose.yml` you run on hardware you own, with no third-party cloud account anywhere in the stack. Everything else — the design tokens, module names, and drawing logic — can carry over almost unchanged from the current build.
