# Development Environment

## Requirements

- Node.js 20+
- pnpm 10+
- Python 3.11 for the Modal processor
- A local Convex deployment for API development

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm --filter @grabpic/api convex:dev
pnpm --filter @grabpic/api dev
pnpm --filter @grabpic/web dev
```

Use `tests/local.env.example` as the opt-in template for local infrastructure
tests. Do not commit filled env files.

## Workspace boundaries

`apps/api` owns Hono routes and Convex functions. `apps/web` owns the UI.
`packages/types` contains cross-application contracts; shared packages must
not import from `apps/*`. `ml/processor.py` is the Modal-only ML entry point.

## Checks

```bash
pnpm lint
pnpm build
pnpm vitest run
python -m unittest ml/test_processor.py
python -m compileall ml
```

The deterministic Convex tests do not need cloud credentials. Deployed-path
tests run only when `RUN_REAL_INFRA_TESTS=1` is explicitly enabled.
