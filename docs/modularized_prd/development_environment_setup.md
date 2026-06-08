# FaceFind - Development Environment Setup

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Prerequisites
```bash
# Node.js (v20+)
node --version  # v20.10.0

# pnpm (faster than npm)
npm install -g pnpm

# Wrangler (Cloudflare CLI)
npm install -g wrangler

# Modal CLI
pip install modal
```

## Monorepo Structure
```
facefind/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/         # App router
│   │   │   ├── components/  # React components
│   │   │   └── lib/         # Utilities
│   │   └── package.json
│   └── api/                 # Cloudflare Workers
│       ├── src/
│       │   ├── routes/      # API endpoints
│       │   └── index.ts     # Hono app
│       └── wrangler.toml
├── packages/
│   ├── db/                  # Turso client & schema
│   ├── types/               # Shared TypeScript types
│   └── config/              # Shared configs (tsconfig, eslint)
├── ml/
│   ├── processor.py         # Modal functions
│   └── requirements.txt
├── pnpm-workspace.yaml
└── package.json
```

## Initial Setup Commands
```bash
# Create monorepo
pnpm init
pnpm add -Dw turbo typescript

# Create Next.js app
cd apps/web
pnpm create next-app@latest . --typescript --tailwind --app

# Create Cloudflare Worker
cd apps/api
pnpm create cloudflare@latest . -- --framework=hono

# Setup Turso
brew install tursodatabase/tap/turso
turso auth signup
turso db create facefind-dev
turso db show facefind-dev  # Get URL + token

# Setup Modal
modal setup
modal token new
```