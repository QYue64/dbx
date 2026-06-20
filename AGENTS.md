# Repository Guidelines

## Project Structure & Module Organization

DBX is a pnpm, Vue, Tauri, and Rust workspace. The desktop frontend lives in `apps/desktop/`, with Vue entry points under `apps/desktop/src/`, static assets in `apps/desktop/public/`, and desktop-specific Vite config in `apps/desktop/vite.config.ts`. Native desktop integration is in `src-tauri/`. Shared Rust database logic is in `crates/dbx-core/`, and the web/Docker backend is in `crates/dbx-web/`. Node packages for the CLI, MCP server, and shared Node core live under `packages/`. Broad app tests are in `packages/app-tests/`; colocated specs also appear as `apps/desktop/src/**/*.spec.ts`. Documentation and deployment assets are in `docs/` and `deploy/`.

## Build, Test, and Development Commands

- `pnpm install` installs workspace dependencies; use Node `>=22.13.0` and pnpm `10.27.0`.
- `pnpm dev:tauri` runs the desktop app in Tauri development mode.
- `pnpm dev:web` runs the frontend in browser mode on port `5173`.
- `pnpm dev:backend` runs the Rust web backend with default development env vars.
- `pnpm build:checked` runs Vue type checking, then builds the frontend.
- `pnpm check` runs the repository check script.
- `cargo check --workspace --locked` validates Rust workspace compilation.

## Coding Style & Naming Conventions

Use TypeScript and Vue patterns already present in `apps/desktop/src/`. Keep variables and functions in English, with descriptive camelCase names; Vue components should use PascalCase filenames where applicable. Format frontend files with `pnpm fmt`, lint with `pnpm lint`, and type-check with `pnpm typecheck`. Rust formatting is controlled by `rustfmt.toml` with edition 2021 and `max_width = 120`; run `cargo fmt`.

## Testing Guidelines

Vitest covers frontend and Node package tests. Use `*.test.ts` in `packages/app-tests/` or package `tests/`, and `*.spec.ts` for colocated desktop specs. Run `pnpm test` for configured Vitest suites and `pnpm test:packages` for package tests. For Rust changes, run `cargo test --workspace`; when unrelated to DuckDB, `--no-default-features` is acceptable for faster local checks.

## Commit & Pull Request Guidelines

This checkout has no Git history available, so follow `CONTRIBUTING.md`: use Conventional Commits such as `fix(app): clamp window size`. Keep pull requests focused, include tests for behavior changes, update docs for user-facing changes, and attach screenshots or logs for UI, database compatibility, or deployment changes.

## Security & Configuration Tips

Do not commit secrets, database credentials, generated keys, or local `.env` files. Use documented development defaults such as `DBX_PASSWORD=test` only for local work. Review `SECURITY.md` before reporting vulnerabilities.
