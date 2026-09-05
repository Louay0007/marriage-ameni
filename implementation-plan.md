# Louay & Ameni Realtime Marriage Contract
## Frontend and Backend Implementation Plan

This plan turns the product specification into an ordered, testable delivery path. Complete each phase's acceptance checks before moving to the next phase. The initial release supports exactly one contract with two authenticated parties, while keeping the data model capable of supporting more contracts later.

---

## 1. Locked Technical Decisions

Use these decisions unless implementation reveals a concrete blocker:

- **Language:** TypeScript across frontend, backend, scripts, and shared protocol types.
- **Repository:** npm workspaces with `client`, `server`, and `shared` packages.
- **Frontend:** React 18, Vite, React Router, CSS Modules, Socket.IO client.
- **Frontend state:** React Context plus `useReducer`; keep transient canvas state inside the signature hook rather than global state.
- **Backend:** Node.js LTS, Express, Socket.IO, PostgreSQL, and `pg` with SQL migrations.
- **Validation:** Zod schemas in `shared`, used at REST and Socket.IO boundaries.
- **Durable writes:** REST for sealing and downloads; Socket.IO for presence, live strokes, snapshots, and chat.
- **Authentication:** secret link exchanged once for an HTTP-only session cookie. Store only token hashes in PostgreSQL.
- **Storage:** server-managed local paths under `storage/signatures` and `storage/pdfs`.
- **PDF generation:** Puppeteer, initiated only by the server after the second seal commits.
- **Testing:** Vitest and Testing Library on the frontend; Vitest, Supertest, and Socket.IO clients on the backend; Playwright for the two-browser critical path.
- **Deployment:** Docker Compose with PostgreSQL, the application, and Caddy.

### System Ownership Rules

- The server is authoritative for identity, seal state, timestamps, persisted messages, and PDF status.
- The client is authoritative only for immediate local canvas rendering and UI state.
- A party can mutate only their own unsealed signature.
- Client-supplied `party`, file paths, timestamps, and finalized state are never trusted.
- Sealing is idempotent. Once a party is sealed, neither REST nor socket handlers may alter that signature.

---

## 2. Target Repository Structure

```text
.
├── client/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── ContractProvider.tsx
│   │   │   └── contractReducer.ts
│   │   ├── components/
│   │   │   ├── ContractDocument.tsx
│   │   │   ├── SignaturePad.tsx
│   │   │   ├── SealButton.tsx
│   │   │   ├── ChatWidget.tsx
│   │   │   ├── ToastRegion.tsx
│   │   │   ├── PresenceIndicator.tsx
│   │   │   └── FinalizedBanner.tsx
│   │   ├── hooks/
│   │   │   ├── useContract.ts
│   │   │   ├── useRealtimeChannel.ts
│   │   │   ├── usePresence.ts
│   │   │   ├── useSignaturePad.ts
│   │   │   └── useChat.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── socket.ts
│   │   │   └── canvas.ts
│   │   ├── styles/
│   │   │   ├── tokens.css
│   │   │   └── global.css
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   └── tests/
├── server/
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── auth/
│   │   │   ├── token.ts
│   │   │   ├── session.ts
│   │   │   └── middleware.ts
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   ├── migrate.ts
│   │   │   └── migrations/
│   │   ├── repositories/
│   │   │   ├── contracts.ts
│   │   │   └── messages.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── contracts.ts
│   │   │   └── health.ts
│   │   ├── sockets/
│   │   │   ├── authenticateSocket.ts
│   │   │   ├── registerRoomHandlers.ts
│   │   │   └── strokeCache.ts
│   │   ├── services/
│   │   │   ├── signatureStorage.ts
│   │   │   ├── finalizeContract.ts
│   │   │   └── exportPdf.ts
│   │   └── scripts/createContract.ts
│   └── tests/
├── shared/
│   └── src/
│       ├── contract.ts
│       ├── api.ts
│       ├── socket.ts
│       └── validation.ts
├── storage/
│   ├── signatures/.gitkeep
│   └── pdfs/.gitkeep
├── docker-compose.yml
├── Caddyfile
├── package.json
├── .env.example
└── README.md
```

Do not expose `storage` as a general static directory. Serve a signature or PDF only through an authenticated, contract-scoped route.

---

## 3. Domain Model and State Machine

### Contract States

The state is derived from persisted columns rather than stored as a loosely synchronized label:

```text
DRAFT
  ├── party A seals -> PARTIALLY_SEALED
  └── party B seals -> PARTIALLY_SEALED

PARTIALLY_SEALED
  └── remaining party seals -> FINALIZING -> FINALIZED

FINALIZING
  └── PDF failure -> FINALIZATION_FAILED -> retry -> FINALIZED
```

### Database Tables

#### `contracts`

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | uuid | primary key |
| `party_a_name` | text | not null |
| `party_b_name` | text | not null |
| `party_a_token_hash` | text | not null, unique |
| `party_b_token_hash` | text | not null, unique |
| `party_a_signature_path` | text | nullable |
| `party_b_signature_path` | text | nullable |
| `party_a_sealed_at` | timestamptz | nullable |
| `party_b_sealed_at` | timestamptz | nullable |
| `finalization_status` | text | `pending`, `processing`, `complete`, or `failed` |
| `finalized_at` | timestamptz | nullable |
| `pdf_path` | text | nullable |
| `created_at` | timestamptz | not null, default now |
| `updated_at` | timestamptz | not null, default now |

Add checks that each signature path and seal timestamp are either both null or both present. PDF path and finalized timestamp must both exist when finalization is complete.

#### `messages`

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | uuid | primary key |
| `contract_id` | uuid | foreign key with cascade delete |
| `sender` | text | `party_a` or `party_b` |
| `body` | text | not null, 1-500 characters |
| `created_at` | timestamptz | server timestamp |
| `seen_at` | timestamptz | nullable; optional for v1 UI |

Index messages by `(contract_id, created_at, id)` for stable chronological pagination.

### Shared Types

Define these once in `shared`:

- `Party = 'party_a' | 'party_b'`
- `PresenceStatus = 'online' | 'signing' | 'idle' | 'offline'`
- `ContractView`, containing names, seal timestamps, finalization status, and authorized download URLs
- `Point = { x: number; y: number; t: number; pressure?: number }`
- `StrokeBatch = { strokeId: string; points: Point[]; final: boolean }`
- Typed Socket.IO client-to-server and server-to-client event maps
- Zod schemas for every untrusted request and event payload

Coordinates must be normalized from `0` to `1` so strokes render correctly on canvases of different sizes.

---

## 4. HTTP and Socket Contracts

### REST API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/exchange` | Validate `{ contractId, token }`, set secure session cookie, return identity and sanitized contract |
| `POST` | `/api/auth/logout` | Clear the current session |
| `GET` | `/api/contracts/:id` | Load authorized contract state and recent messages |
| `POST` | `/api/contracts/:id/seal` | Accept own PNG blob as multipart data and atomically seal the authenticated party |
| `GET` | `/api/contracts/:id/signatures/:party` | Return an authorized sealed signature image |
| `GET` | `/api/contracts/:id/pdf` | Return the finalized PDF to an authorized party |
| `GET` | `/api/health/live` | Process liveness |
| `GET` | `/api/health/ready` | Database and writable-storage readiness |

Use consistent JSON errors:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};
```

### Client-to-Server Socket Events

| Event | Payload | Acknowledgement |
|---|---|---|
| `presence:update` | `{ status }` | validation result |
| `stroke:batch` | `{ strokeId, points, final }` | accepted sequence number |
| `stroke:clear` | `{}` | success or sealed error |
| `strokes:request` | `{}` | current draft strokes for both parties |
| `message:send` | `{ clientId, body }` | persisted message or error |
| `message:seen` | `{ messageId }` | optional v1 enhancement |

### Server-to-Client Socket Events

| Event | Payload |
|---|---|
| `presence:state` | statuses for both parties |
| `stroke:batch` | authenticated party, batch, and sequence number |
| `stroke:clear` | authenticated party |
| `strokes:snapshot` | all current unsealed stroke batches |
| `message:new` | persisted message with server ID and timestamp |
| `contract:sealed` | party, sealed timestamp, and signature URL |
| `contract:finalizing` | contract ID |
| `contract:finalized` | finalized timestamp and PDF URL |
| `contract:finalization_failed` | retryable status without internal error details |

The server adds party identity to broadcasts from the authenticated socket. The client never sends a trusted party field.

---

## 5. Frontend Plan

### 5.1 Application Shell and Loading

1. Route `/c/:contractId` reads a one-time `key` query parameter.
2. If present, exchange it for an HTTP-only cookie and immediately replace browser history with a URL that excludes the key.
3. Fetch the sanitized contract state.
4. Render explicit loading, invalid-link, unauthorized, unavailable, and retry states.
5. Connect Socket.IO only after the authenticated contract fetch succeeds.

### 5.2 Contract State

Use one reducer for server-derived application state:

- authenticated party and counterpart
- contract details and seal state
- connection and presence state
- persisted messages
- toast queue
- finalization status and PDF availability

Keep pointer positions, active path construction, animation frames, and canvas contexts out of React state. Store them in refs managed by `useSignaturePad`.

### 5.3 Document Experience

- Build the actual contract as the first screen, with restrained top controls rather than a landing page.
- Use semantic headings, readable contract sections, signature blocks, timestamps, and a ceremonial-not-legal footer.
- Use CSS custom properties for the specified parchment, paper, ink, wine, sage, and gold colors.
- Load Playfair Display, EB Garamond, and Inter locally in production when possible so the app remains self-hosted.
- On desktop, present the signatures as a balanced two-column section; on mobile, stack them with the current party's editable pad first.
- Make focus states, labels, status changes, dialogs, and toast announcements accessible.

### 5.4 Signature Pad

Implement in this order:

1. Size the backing canvas for `devicePixelRatio` while preserving CSS dimensions.
2. Use Pointer Events and pointer capture for mouse, touch, and stylus.
3. Normalize points to the canvas bounds.
4. Draw local points immediately through `requestAnimationFrame`.
5. Batch outgoing points every 30-50 ms; flush on `pointerup`, `pointercancel`, and `lostpointercapture`.
6. Render remote batches using the same interpolation function as local strokes.
7. Redraw from retained stroke data after resize or device rotation.
8. Disable draw and clear controls when that party is sealed.
9. Disable sealing until the local signature contains at least one valid stroke.
10. Export a transparent PNG at a stable output resolution for sealing.

Handle one active pointer only. Ignore accidental secondary touches and prevent page scrolling only while drawing inside the pad.

### 5.5 Realtime Lifecycle

- Establish one socket per authenticated browser tab.
- Register handlers once and remove them during cleanup.
- On connect or reconnect, request a stroke snapshot before applying subsequent live batches.
- Use sequence numbers to discard duplicate batches and detect gaps.
- Show a quiet reconnecting indicator; local draft drawing may continue and queue bounded batches briefly.
- If reconnection cannot recover a complete draft, request a fresh snapshot and replace the remote draft.

### 5.6 Presence and Chat

- Presence starts as online after socket authentication.
- Pointer down changes local status to signing; return to online after a short inactivity delay.
- Use Socket.IO disconnect as the primary offline signal and application heartbeat only for stale or frozen sessions.
- Optimistically show a sending chat message using `clientId`, then replace it with the server message on acknowledgement.
- Limit message input to 500 characters and prevent blank-only messages.
- Show incoming messages in the log and in an accessible toast for 4-5 seconds.

### 5.7 Sealing UX

1. Show a confirmation dialog explaining that sealing cannot be undone.
2. Convert the local canvas to a PNG blob.
3. Submit multipart data to the seal endpoint with an idempotency key.
4. Keep the pad locked while the request is pending.
5. On success, replace the canvas with the server-served signature image and timestamp.
6. On a retryable failure, unlock the pad without discarding the local draft.
7. When both parties seal, show finalization progress.
8. On completion, run the single wax-seal animation and expose the authenticated PDF download action.

---

## 6. Backend Plan

### 6.1 Server Foundation

- Parse and validate environment variables at startup.
- Configure request IDs, structured logs, JSON size limits, cookie parsing, Helmet, and explicit CORS rules for development.
- Attach Socket.IO to the same HTTP server as Express.
- Add graceful shutdown for HTTP, sockets, and the PostgreSQL pool.
- Fail readiness when PostgreSQL is unavailable or storage is not writable.

### 6.2 Contract Creation and Authentication

- Create a CLI script that inserts the contract and prints two shareable URLs exactly once.
- Generate at least 32 random bytes per token.
- Store a SHA-256/HMAC token fingerprint or a password-hash equivalent, never the raw token.
- Exchange the raw link token for a signed, HTTP-only, `SameSite=Strict`, secure production cookie.
- Bind the session to `contractId` and `party`; use a short, configurable expiration.
- Authenticate Socket.IO from the same signed cookie during the handshake.

### 6.3 Repositories and Transactions

- Keep SQL in repository modules and pass explicit database clients into transaction-sensitive functions.
- Use parameterized queries exclusively.
- Lock the contract row during sealing with `SELECT ... FOR UPDATE`.
- Update only the authenticated party's null seal fields.
- Treat a repeat seal request with the same idempotency key as success; reject conflicting attempts.
- Derive public contract state from database rows through one mapper that never exposes token hashes or disk paths.

### 6.4 Stroke Cache and Presence

- Key draft strokes by contract ID and party.
- Store ordered batches with bounded points, stroke count, and total memory limits.
- Reject points outside normalized bounds, oversized batches, malformed timestamps, and writes from sealed parties.
- Rate-limit by socket and event class. Allow enough headroom for normal 30-50 ms batches.
- Clear cached strokes only after a successful seal commit or authenticated clear event.
- Track all sockets for each party so closing one tab does not mark that party offline while another tab remains connected.
- Periodically remove abandoned contract caches after a configured TTL.

### 6.5 Chat

- Validate and normalize the message body without altering meaningful Unicode text.
- Persist before broadcasting.
- Use the database-generated ID and server timestamp in the acknowledgement and broadcast.
- Deduplicate retries by `(contract_id, sender, client_id)`; add `client_id` to the table if optimistic retry behavior is implemented.
- Return recent history with a fixed limit and cursor pagination.

### 6.6 Signature Storage and Atomic Seal

The seal service performs this sequence:

1. Authenticate the session and validate the contract route.
2. Validate PNG MIME type, byte signature, dimensions, and maximum size.
3. Write to a temporary file under the storage volume.
4. Begin a database transaction and lock the contract row.
5. Confirm the authenticated party is not already sealed.
6. Atomically rename the temporary file to a server-generated path.
7. Save the relative path and database-generated seal timestamp.
8. Commit, clear that party's stroke cache, and broadcast `contract:sealed`.
9. If both parties are now sealed, claim finalization and start it once.

Clean up temporary files on all failure paths. Never accept a client-provided filename or storage path.

### 6.7 PDF Finalization

- Use a dedicated server-side print template containing the exact contract text and both stored signature images.
- Block all external requests in Puppeteer so PDF generation stays self-contained.
- Use local font files and deterministic page dimensions, margins, and locale formatting.
- Claim finalization with an atomic transition from `pending` or `failed` to `processing`.
- Write the PDF to a temporary file, rename atomically, then mark the contract complete.
- Broadcast completion only after the PDF path and finalized timestamp commit.
- Record failures with structured logs, expose a generic failed status, and support an operator retry command.

---

## 7. Delivery Phases

### Phase 0: Repository Foundation

**Status: Implemented and verified.**

**Build**

- Create npm workspaces and TypeScript configurations.
- Add linting, formatting, unit-test, build, and type-check scripts.
- Create `shared` domain and protocol types.
- Add `.env.example`, `.gitignore`, and storage placeholders.

**Acceptance checks**

- `npm install` succeeds from the repository root.
- `npm run typecheck`, `npm test`, and `npm run build` run across all workspaces.
- Client and server import shared types without copying definitions.

### Phase 1: Static Frontend and Local Signing

**Status: Implemented and verified.**

**Build**

- Implement the responsive contract document and all visual tokens.
- Implement local-only signature drawing, clearing, resize redraw, and PNG export.
- Add sealed/read-only visual states using fixture data.

**Acceptance checks**

- Mouse, touch emulation, and pointer cancellation work.
- Signature remains visually stable after resize.
- Layout has no overlap at 320 px mobile width and common desktop widths.
- Keyboard focus and screen-reader labels cover all controls.

### Phase 2: Backend, Database, and Authentication

**Status: Implemented. Live PostgreSQL startup requires Docker registry connectivity.**

**Build**

- Start Express, Socket.IO, PostgreSQL, migrations, health endpoints, and repositories.
- Add the create-contract CLI and token exchange flow.
- Replace frontend fixtures with authenticated contract loading.

**Acceptance checks**

- Each valid link resolves to the correct party.
- A modified, expired, or cross-contract token is rejected.
- Raw tokens never appear in database rows or application logs.
- Refresh works after the query token is removed from the URL.

### Phase 3: Presence and Chat

**Status: Implemented and verified with integration and browser tests.**

**Build**

- Authenticate sockets and join `contract:{id}` rooms.
- Add multi-tab-aware presence and heartbeat expiry.
- Persist, acknowledge, broadcast, and reload chat history.

**Acceptance checks**

- Two browsers see join, signing, idle, and leave state changes.
- Messages survive server and browser restarts.
- Invalid and excessive socket events are rejected without affecting the room.
- A user cannot publish events into another contract room.

### Phase 4: Live Signature Synchronization

**Status: Implemented and verified with integration and browser tests.**

**Build**

- Add normalized stroke batches, server cache, remote interpolation, clear events, snapshots, sequence handling, and reconnect recovery.

**Acceptance checks**

- Remote ink appears smoothly with normal network latency.
- Different canvas dimensions produce equivalent signatures.
- Refreshing or reconnecting restores both unsealed drafts.
- Duplicate, missing, late, and out-of-order batches do not corrupt the canvas.
- Drawing traffic stays within configured event and payload limits.

### Phase 5: Sealing and Final PDF

**Status: Implemented and verified with local Chromium and browser tests.**

**Build**

- Add authenticated PNG upload, atomic per-party seal, sealed broadcasts, finalization claiming, Puppeteer export, and protected PDF download.

**Acceptance checks**

- A party cannot seal an empty, invalid, oversized, or another party's signature.
- Concurrent seal requests produce one signature and one timestamp.
- Sealed signatures cannot be changed or cleared through REST or sockets.
- The second seal starts exactly one PDF generation job.
- The generated PDF contains both names, signatures, timestamps, and complete contract text.
- The PDF remains downloadable after all containers restart.

### Phase 6: Hardening and Deployment

**Status: Implemented. Compose configuration is verified; image build awaits Docker registry connectivity.**

**Build**

- Add Dockerfiles, Compose health checks, persistent volumes, Caddy configuration, production headers, backups, and operational documentation.
- Add end-to-end tests and run accessibility and responsive checks.
- Add finalization retry and stale temporary-file cleanup commands.

**Acceptance checks**

- A clean machine can start the stack with documented commands.
- HTTPS and WebSocket upgrades work through Caddy.
- PostgreSQL, signatures, and PDFs survive container recreation.
- Database and storage backup/restore is rehearsed successfully.
- No secret, token, internal path, or stack trace is sent to the browser.

### Phase 7: Optional Guest Viewer

**Status: Implemented and verified with a read-only browser test.**

Implement only after the two-party flow is stable. Model access grants separately from party token columns if multiple viewers or revocation are required. A viewer may read contract state and receive events but cannot send strokes, messages, seals, or presence as a party.

---

## 8. Test Strategy

### Unit Tests

- Reducer transitions and derived contract state
- Coordinate normalization and canvas interpolation
- Zod validation and payload limits
- Token hashing and constant-time comparison behavior
- Contract mappers that remove private fields
- Finalization state transitions

### Integration Tests

- Token exchange, cookie authentication, and contract authorization
- Socket handshake and room isolation
- Message persistence before broadcast
- Stroke ownership, rate limiting, clear, and snapshot behavior
- Concurrent and repeated seal requests
- Protected signature and PDF downloads

Use a dedicated PostgreSQL test database. Do not mock repository behavior in tests intended to verify transactions or constraints.

### End-to-End Tests

Run two isolated Playwright browser contexts representing Louay and Ameni:

1. Open both secret links and confirm identities.
2. Verify presence in both directions.
3. Exchange messages and observe toast plus history.
4. Draw in each browser and verify remote canvas pixels become nonblank.
5. Disconnect one browser, continue drawing, reconnect, and verify snapshot recovery.
6. Seal one party and verify only that pad locks.
7. Seal the second party and wait for finalization.
8. Download the PDF and verify it is nonempty and starts with a PDF signature.
9. Restart the application and confirm finalized state and download still work.

### Manual Device Checks

- Safari on iPhone or iPad for touch and pointer behavior
- Chrome/Edge desktop for mouse input
- Stylus device when available to verify optional pressure handling
- Slow and interrupted network profiles for reconnect behavior
- Print/PDF visual inspection for signature placement and font loading

---

## 9. Security and Privacy Checklist

- [ ] Raw access tokens are generated securely, shown once, hashed at rest, and redacted from logs.
- [ ] Query tokens are removed from browser history immediately after exchange.
- [ ] Cookies are HTTP-only, signed, same-site, and secure outside LAN development.
- [ ] All REST routes and socket events authorize contract and party server-side.
- [ ] CSRF protection is applied to cookie-authenticated state-changing REST requests.
- [ ] Request, message, stroke, and upload sizes are bounded.
- [ ] REST and socket event classes have appropriate rate limits.
- [ ] Uploaded images are decoded and validated, not trusted by extension or MIME alone.
- [ ] Storage filenames are generated by the server and protected from traversal.
- [ ] Puppeteer cannot reach external networks or arbitrary user-controlled URLs.
- [ ] Errors returned to clients contain no stack traces, SQL details, or disk paths.
- [ ] PostgreSQL is not publicly exposed.
- [ ] HTTPS/WSS is enabled for internet deployment.
- [ ] Backups include PostgreSQL and the complete storage volume.
- [ ] The UI labels the document as ceremonial unless legal compliance is added separately.

---

## 10. Operations and Deployment

### Required Environment Variables

```text
NODE_ENV
PORT
PUBLIC_ORIGIN
DATABASE_URL
STORAGE_DIR
SESSION_SECRET
TOKEN_PEPPER
SESSION_TTL_SECONDS
MAX_SIGNATURE_BYTES
```

Do not put production values in Compose or commit them to Git. Load them from an ignored environment file or Docker secrets.

### Container Responsibilities

- **postgres:** durable database volume, localhost-only host binding when a host port is needed.
- **app:** builds the client, serves static assets and API, hosts Socket.IO, and runs Puppeteer.
- **caddy:** terminates TLS, applies the public hostname, and proxies HTTP/WebSocket traffic to the app.

### Backup and Recovery

- Schedule PostgreSQL dumps and filesystem backups together.
- Retain several generations and keep at least one copy off the application machine when privacy requirements allow.
- Document restore commands and test restoration before considering deployment complete.
- Treat database and storage as one consistency set: a database row without its signature/PDF file is incomplete.

### Observability

- Emit structured logs with request ID, contract ID, event type, latency, and outcome.
- Never log tokens, cookies, message bodies, signature bytes, or full share URLs.
- Track connected sockets, rejected events, seal duration, PDF duration/failures, and database health.
- Use health endpoints for Compose checks and deployment diagnosis.

---

## 11. Definition of Done

The production release is done when:

- Louay and Ameni can independently open private links and are authenticated as the correct party.
- Both see accurate presence, exchange durable messages, and watch each other's signatures appear live.
- Reconnection restores unsealed signatures without corrupting or duplicating strokes.
- Each can seal only their own nonempty signature, exactly once.
- After the second seal, the server creates exactly one durable PDF and both clients receive a download action.
- The contract, messages, signatures, seal timestamps, and PDF survive a complete stack restart.
- The complete two-browser flow passes automated tests on desktop and manual checks on a touch device.
- Authorization, input limits, token handling, storage protection, HTTPS, backups, and the ceremonial disclaimer are verified.

---

## 12. Recommended Execution Order

Work one vertical slice at a time:

1. Finish Phase 0 and keep all checks green.
2. Build the complete visual contract and local canvas in Phase 1.
3. Establish durable identity and loading before adding realtime behavior.
4. Prove socket authentication with presence, then chat persistence.
5. Add stroke streaming only after room authorization and rate limiting exist.
6. Add sealing only after signature ownership and reconstruction are reliable.
7. Add PDF finalization, then harden, deploy, and rehearse recovery.

Avoid implementing optional viewer access, legal e-signature claims, multiple-contract administration, or elaborate read receipts until the core two-person finalization flow satisfies the definition of done.