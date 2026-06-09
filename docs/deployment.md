# Deployment Guide

This guide walks through provisioning and deploying GrabPic to production.

## Prerequisites

- Node.js ≥20, pnpm ≥9
- Python ≥3.11, uv (pip installer)
- Accounts: [Turso](https://turso.tech), [Cloudflare](https://cloudflare.com), [Modal](https://modal.com), [Vercel](https://vercel.com) (optional)
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) logged in

## 1. Turso Database

```bash
# Create database
turso db create grabpic-prod

# Get connection URL and token
turso db show grabpic-prod
turso db tokens create grabpic-prod

# Run migration
pnpm --filter @grabpic/db migrate
```

Set `TURSO_URL` and `TURSO_TOKEN` from the output.

## 2. Cloudflare R2

```bash
# Create bucket
wrangler r2 bucket create grabpic-photos

# Generate API keys (Cloudflare Dashboard > R2 > Manage R2 API Tokens)
# Required permissions: Object Read & Write
```

Set `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 3. Modal ML Processor

```bash
cd ml
uv venv
uv pip install -r requirements.txt
modal setup
modal token new

# Deploy the processor
modal deploy processor.py

# Get the webhook URL from Modal dashboard
```

Set `MODAL_TOKEN` and `MODAL_WEBHOOK_URL`.

## 4. API Worker

```bash
# Fill in wrangler.toml vars
#   MODAL_TOKEN, MODAL_WEBHOOK_URL, SENTRY_DSN

# Deploy
pnpm --filter @grabpic/api deploy
```

## 5. Frontend

```bash
# Set environment variables
#   NEXT_PUBLIC_API_URL=https://api.grabpic.app
#   NEXT_PUBLIC_POSTHOG_API_KEY=...

# Deploy to Vercel
vercel --prod
```

## 6. GitHub Actions CI

Add repository secrets matching `.env.example` keys, then push to `main`.

## Verification

```bash
curl https://api.grabpic.app/health
# → {"status":"ok"}

curl https://api.grabpic.app/health/processing
# → {"status":"ok","database":"connected"}
```
