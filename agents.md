# Agent Instructions: Trainara web

## 1. Role & Context

You are a Senior Fullstack Engineer specializing in the **SvelteKit, Bun, and Supabase** ecosystem. Your goal is to build a lean, high-performance, and "Zero-Trust" web client for the reverse-engineered Trenara API. You prioritize native platform features over external libraries to minimize complexity and bundle size.

## 2. Core Tech Stack

- **Runtime & Package Manager:** Bun (Always use `bun` commands: `bun install`, `bun run dev`, `bun run test`).
- **Framework:** SvelteKit (Deployed on Vercel Free Tier).
- **Database & Auth:** Supabase.
- **UI & Styling:** Tailwind CSS v4 (CSS-first `@theme` in `src/app.css`, no `tailwind.config.js`), Lucide Svelte.
- **Validation:** Zod for schema and form validation.

## 3. Security Protocol (Strict)

- **Zero-Trust Backend:** Never trust `event.locals.user` alone. Re-verify the session in `hooks.server.ts` and `+page.server.ts` before sensitive operations.
- **State Validation:** Before any mutation, verify the current state server-side rather than trusting what the client sent. What a session allows is decided by the coach's own `can_*` flags on that training — check them upstream instead of re-deriving them in the browser.
- **Database Security:** **Row Level Security (RLS)** is the primary defense. Every table must have a policy.
- **XSS & Sanitization:** Use Svelte's native escaping. For HTML that comes back from the API (chat, news), sanitize with `dompurify`.
- **Session Management:** Use Supabase Auth Helpers. Ensure cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- **CSRF:** Use SvelteKit **Form Actions** for all data mutations to leverage built-in CSRF protection.
- always execute on the server-side
- use tokens for auth

## 4. UI Architecture & Reusability

- **Components:** Domain components live in `$lib/components`, grouped by feature (`calendar/`, `training/`, `chat/`, `charts/`). There is no UI primitive library — components are written directly against Tailwind classes.
- **Icons:** Use `lucide-svelte`.
- **Theming:** The app is dark only. The palette is defined once as `@theme` tokens in `src/app.css`; there is no light palette and no theme switcher.
- **Native-First:** Use native HTML validation attributes alongside Zod. Use SvelteKit’s `enhance` for progressive enhancement.

## 5. Coding Standards & Linting

- **Naming:** `kebab-case` for files/folders; `PascalCase` for Svelte components.
- **TypeScript:** - Strict mode enabled. No `any`.
  - Use `type` imports: `import type { User } from '@supabase/supabase-js'`.
  - Use `interface` for data models and component props.
- **Linting:** ESLint + Prettier (`bun run lint`). Tabs for indentation, single quotes, semi-colons required, 100-column print width — all enforced by `.prettierrc`, so run `bun run format` rather than matching it by hand.
- **Clean Code:** No `axios` (use `fetch`), no `lodash` (use native JS), no `onMount` for data fetching if a SvelteKit `load` function can do it.
- **Performance** use db indexing, and other best practices

## 6. Testing Strategy (Vitest)

- **Runner:** Vitest under jsdom — `bun run test`. Not `bun test`; the two are different runners and only Vitest is configured here.
- **Unit Tests:** All utility functions and pure logic must have a `*.test.ts` file in the same directory.
- **Component Tests:** `@testing-library/svelte` for components, mounted into jsdom.
- **Mocking:** Mock Supabase responses and SvelteKit `event` objects to ensure the "Sad Path" (errors) and "Happy Path" work as expected.
- **API Payloads:** `src/lib/server/trenara/payloads.test.ts` pins the reverse-engineered response shapes with `satisfies` clauses against fixtures transcribed from real traffic. Request bodies are pinned the same way, in `training.ts`. Update the fixture when the API changes — do not loosen the type.
- **Trying a branch:** the maintainer tests branches as **Vercel preview deployments**, not with a local dev server. Anything meant to be seen or exercised by hand must therefore work in a production build: no `dev`-only code paths, no env-var flags to set, and diagnostics on screen rather than in a terminal.
