# Repository Guidelines

## Project Structure & Module Organization
GrabPic is a `pnpm`/Turborepo monorepo. Keep user-facing code in `apps/`, shared code in `packages/`, ML processing in `ml/`, integration tests in `tests/`, and product or ops notes in `docs/`.

- `apps/web`: Next.js 14 frontend (`src/app`, `src/components`, `src/lib`)
- `apps/api`: Cloudflare Workers API with Hono routes in `src/routes`
- `packages/db`, `packages/types`, `packages/config`: shared workspace packages
- `ml/processor.py`: Python 3.11 ML entry point, with dependencies in `ml/requirements.txt`
- `tests/*.test.ts`: Vitest suites for contracts, latency, and throughput

Do not make shared packages depend on `apps/*`.

## Build, Test, and Development Commands
- `pnpm dev`: run the workspace in development mode through Turbo
- `pnpm --filter @grabpic/web dev`: start the Next.js app only
- `pnpm --filter @grabpic/api dev`: start the Workers API only
- `pnpm build`: build all configured workspaces
- `pnpm lint`: run workspace type checks (`tsc --noEmit`)
- `pnpm format`: apply Prettier to `ts`, `tsx`, `js`, and `json`
- `pnpm vitest run`: run the top-level test suite
- `pip install -r ml/requirements.txt`: install Python ML dependencies

## Coding Style & Naming Conventions
TypeScript uses Prettier formatting with 2-space indentation and no semicolons. Follow current naming patterns: React components in `PascalCase.tsx`, utility files in `camelCase.ts` or domain-oriented names, and tests as ordered `NN-description.test.ts`. Keep route handlers thin and place shared types in `packages/types`.

## Testing Guidelines
Vitest is configured in [vitest.config.ts](/D:/Projects/GrabPic/vitest.config.ts). Put new tests under `tests/` and name them `*.test.ts`. Some suites hit real infrastructure and may skip when required `.env` values are missing; keep contract-level tests runnable without secrets. Add coverage for API shape changes, latency-sensitive flows, and cleanup paths.

## Commit & Pull Request Guidelines
Recent commits use concise conventional prefixes such as `feat(api): ...`, `feat(web): ...`, and `docs: ...`. Keep subjects imperative and scoped when useful. PRs should include a short summary, linked issue or task, notes about env or deployment changes, and screenshots for visible `apps/web` changes.

## Security & Configuration Tips
Use `.env.example` as the source of required variables and never commit filled `.env` files or secrets. Validate configuration changes against both the web app and Workers API before merging.
