# Louay & Ameni Marriage Contract

A private realtime marriage-contract signing experience. The repository is organized as npm workspaces for the React client, Node.js server, and shared TypeScript contracts.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop or another PostgreSQL 16 installation

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d postgres
set -a && source .env && set +a
npm run migrate --workspace @marriage/server
npm run create-contract --workspace @marriage/server
```

Replace `SESSION_SECRET` and `TOKEN_PEPPER` in `.env` with independent random values before running the server. The create-contract command prints one private link for Louay and one for Ameni. Those raw tokens are shown only once and are stored in PostgreSQL as HMAC fingerprints.

Start the backend and frontend in separate terminals:

```bash
set -a && source .env && set +a
npm run dev:server
```

```bash
npm run dev
```

When PostgreSQL or Docker is unavailable, run the complete disposable demo backend instead:

```bash
npm run dev:demo --workspace @marriage/server
```

It prints private local links for Louay, Ameni, and a read-only guest. Demo records reset whenever the process restarts; production always uses PostgreSQL.

Open the private links printed by the create-contract command. The client exchanges each query token for an HTTP-only session cookie and removes the token from browser history.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run lint
npm run format:check
npm run test:e2e
```

## Production

Set `SITE_ADDRESS` and `PUBLIC_ORIGIN` to the public HTTPS URL, replace every secret in `.env`, then run:

```bash
docker compose up -d --build
```

Caddy obtains TLS certificates when `SITE_ADDRESS` is a publicly resolvable domain. For local HTTP testing, leave it as `http://localhost`.

Create coordinated database and storage backups with `./scripts/backup.sh`. Restore one generation with `./scripts/restore.sh backups/<timestamp>` while application writes are stopped. Run stale upload cleanup with `npm run cleanup --workspace @marriage/server` and retry a failed PDF with `npm run retry-finalization --workspace @marriage/server -- <contract-id>`.

The implementation covers Phases 0 through 7: repository tooling, responsive signing, PostgreSQL persistence, private-link authentication, authenticated rooms, presence, durable chat, live stroke synchronization, immutable signature sealing, local PDF generation, self-hosted deployment, and read-only guest viewing.

The ignored `.env` contains complete randomly generated local values. Generate new values before any public deployment. If Docker reports DNS or registry errors, verify Docker Desktop proxy/DNS settings and confirm `docker pull postgres:16-alpine` succeeds before starting Compose.
