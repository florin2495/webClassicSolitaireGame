@AGENTS.md

# webClassicSolitaireGame (Classic Solitaire) - project notes for Claude

Classic Klondike solitaire (game 12 of the hub), shown as "Classic Solitaire" (folder `D:\_DEv\012_ClassicSolitaire`), for one player, made for an Android phone. No ads, no account,
works offline, installable as its own app. Single page; the whole game runs in the browser.

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webClassicSolitaireGame`, public). Never the work account.
  Local git identity is pinned in `.git/config`.
- The user connects the repo to Vercel by hand (suggested project name `012_web-classic-solitaire-game`, domain `012web-classic-solitaire-game.vercel.app`). Once connected, every
  push to `main` deploys to production: https://games.hailatat.icu/classicsolitaire (the hub proxies `/classicsolitaire/*` to this
  project; `basePath: "/classicsolitaire"` in `next.config.ts`, zone in the hub's `next.config.ts`).
- `vercel.json` pins `"framework": "nextjs"` and `"regions": ["fra1"]` (Frankfurt, next to the Supabase DB). Never remove it.
- Env vars (Vercel + `.env.local`, only for feedback): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Feedback (`POST /api/feedback`) writes to `hub_feedback` (owned by `florin2495/hailataticu-hub`, slug `solitaire`).
- Hub entry: `D:\_DEv\000_Startup\src\games.ts` (slug `solitaire`, url `/classicsolitaire`).
- Ask the user before pushing (= deploying), unless they explicitly say to deploy.
- **Before every push, bump the patch version** in `package.json` (and `npm install --package-lock-only`). It is shown
  in the menu ("Versiunea x.y.z"), and it is what makes the update button appear on open copies of the game.

## Database
None of its own: no `solitaire_` tables, no migrations. Game, settings and statistics live in the browser's
localStorage (`solitaire:game:v1`, `solitaire:settings:v1`, `solitaire:stats:v1`). Changing the shape of a saved game
needs a new key or a migration in `src/lib/store.ts` (`isValidGame` throws away anything that does not fit, which
silently starts a new game).

## Design
- Rules: `src/lib/solitaire.ts` (pure, unit-tested). Cards are 0..51 (`suit = floor(c/13)` in S,H,C,D order,
  `rank = c%13+1`), piles keep the top card last. Draw 1 or 3; scoring Standard (classic desktop values: +10 to a
  foundation, +5 waste to tableau, +5 card turned, −15 foundation to tableau, −100 recycle with draw 1 / −20 from the
  3rd recycle with draw 3, −2 every 10 s when timed, bonus 700000/seconds on a win of 30 s+, never below 0), Vegas
  (−52, +5 per foundation card, 1 pass with draw 1, 3 with draw 3) or none. Face-down cards turn over by themselves.
  Same seed = same deal (`mulberry32`).
- Empty column: **any card by default** (the user's choice, 2026-11-21; the classic XP rule is king only). Menu setting
  "Pe o coloană goală poate veni" = `Options.kingOnly` (missing = false, so old saves count as any card); it applies at
  once, to the current game and its undo history, not from the next deal. Engine: `canOnTableau(card, col, anyOnEmpty(s))`.
- A tap sends a card where it fits (`autoTarget`: foundation first, then a non-empty column, then an empty column if
  the rule allows it and the card is not already at the bottom of its column); cards can also be dragged (pointer events, `dropTarget`). When stock and
  waste are empty and everything is face up, the rest goes up by itself (`autoStep`). Undo is unlimited (in memory).
  "Indiciu" = `findHint`.
- Game lost (`src/lib/stuck.ts`, `outlook`): when the hint has nothing better than "deal a card", every reachable
  position is searched (deals, recycles, every legal move incl. foundation to tableau and parts of runs; up to 4000
  positions, else "unknown" and nothing is shown). No position with more foundation cards or fewer face-down cards =
  proven lost: dialog "Nu mai sunt mutări" (once per game; "Mă mai uit" / "Joc nou"; closing it is saved with the game as the optional
  `lostDismissed`, so a reload does not bring it back), the hint then says so too (it suggests "Înapoi" only when there
  is something to undo: the history is not kept across a reload). The
  user's first idea ("a whole pass of the stock where the hint only says deal") is not used on purpose: it calls games
  lost that a card taken back down from a foundation still saves (`rescueBoard` in `src/lib/test-boards.ts`).
- Win: the cards leave the foundations one by one and bounce off the bottom edge leaving trails (`WinCascade.tsx`,
  canvas), a tap skips it, then a result dialog. Every copy in a trail has a black outline; 35% of the cards
  (`SLOW_SHARE` in `src/lib/cascade.ts`, the user's choice) move 1-2 px a step, so their outlines merge into a black band
  like in the original. `celebrated` in the saved game stops a replay after a reload.
- Card art is drawn in `src/lib/cards.ts` as SVG (our own design, not copied from any other game). Suits are SVG
  shapes, never the ♠♥♦♣ characters (Android may draw those as emoji). Three backs (blue, red, green).
- Layout: `src/lib/layout.ts`, 7 columns across the width, long columns squeezed to stay on screen.
- Store: `src/lib/store.ts`, a module-level store for `useSyncExternalStore` (no setState in effects), saved on
  every change. `?seed=N&draw=1|3` deals a fixed game (tests); the parameters are removed from the URL right away.

## PWA, offline and the update button
- Names: page title and manifest `name` "Classic Solitaire"; manifest `short_name` "Solitaire" (Android cuts longer
  home-screen labels). Hub card "Classic Solitaire", feedback slug stays `solitaire` (like Bingo: path `/classicbingo`, slug `bingo`).
- `manifest.ts`: its own app (`id` `/classicsolitaire/`, `scope` and `start_url` `/classicsolitaire`), so it installs separately
  from the hub app. Android Chrome: the page catches `beforeinstallprompt` (`src/lib/pwa.ts`) and shows
  "📲 Instalează pe telefon"; the menu explains the manual way.
- Service worker: `src/app/sw.js/route.ts` serves `/classicsolitaire/sw.js` (request-time, contains the version, header
  `Service-Worker-Allowed: /classicsolitaire` because the page URL has no trailing slash). It precaches the page and every
  `/_next/static` file the HTML references; pages are network-first (4 s, then the cache), hashed static files
  cache-first, `/api` never cached. Old caches (`solitaire-<version>`) are deleted on activate.
- Update button (`UpdateButton.tsx`, in its own strip above the board, never over the cards): shown when
  `GET /classicsolitaire/api/version` differs from the bundled version or a new worker of another version is waiting;
  it tells the worker to take over (`SKIP_WAITING`) and reloads. The worker answers `GET_VERSION` (MessageChannel): a
  waiting worker of the version the page already runs (the HTML is network-first, and a reload never activates a
  waiting worker) gets `SKIP_WAITING` at once, with no button and no reload (`waitingWorkerAction` in `src/lib/pwa.ts`).
  Checked on load, on every return to the app and every 5 minutes. The game is saved, so reloading loses nothing.

## Testing (GitHub Actions, manual only)
All checks run in GitHub Actions on the free tier (public repo, `ubuntu-latest` only), never locally (user's rule,
`D:\_DEv\CLAUDE.md`). Every workflow is `workflow_dispatch` only.
| Workflow | Runs |
| --- | --- |
| `check.yml` "Check code" | `npx next typegen` + `npx tsc --noEmit`, `npx eslint src`, `npx next build` (every step runs) |
| `unit-tests.yml` "Unit tests" | `npm test` (Vitest): rules incl. 150 hint-played random games, layout on 4 screen sizes, card art, store (in memory), feedback validation |
| `e2e.yml` "E2E" | `node scripts/e2e.mjs <base_url>`: page, version in the client JS, `/api/version`, manifest, icons, `sw.js` headers, feedback validation (400s and the honeypot, nothing stored), fra1, 404 |
| `e2e-ui.yml` "E2E UI (Playwright)" | `tests/ui/*.e2e.ts` on desktop Chromium and Pixel 7 (Chromium): a fixed deal played by taps must match the engine card for card, undo, reload keeps the game, draw 3 fan, new-game confirmation, hint, win (auto-finish, bouncing cards, result, no replay after reload), menu settings/backs/stats; desktop only: manifest + `sw.js`, offline reload, update button (mocked `/api/version`), drag & drop; phone only: fits the screen, card and button sizes, landscape |

- E2E and E2E UI need the deploy of the version under test to be live (run them on `main` after Vercel finished).
  No database, so no `concurrency: e2e` group (nothing shared to protect) and **no repo secrets on purpose** (no
  workflow needs them; agreed with the user 2026-11-21, exception to `D:\_DEv\CLAUDE.md`). Don't add them back.
- Playwright files are `*.e2e.ts`, never `*.spec.ts` / `*.test.ts` (Vitest would pick those up).
- UI tests use `data-card` / `data-pile` (`stock`, `waste`, `f0`-`f3`, `t0`-`t6`) / `data-index` / `data-up` on the card
  images, `data-slot` on the empty places, and `data-testid`: `board`, `stock-slot`, `score`, `time`, `new-game`,
  `undo`, `hint`, `menu-open`, `menu`, `menu-new-game`, `setting-draw`, `setting-scoring`, `setting-timed`, `setting-empty`, `stats`,
  `stat-played`, `stat-won`, `app-version`, `confirm-new`, `confirm-new-yes`, `toast`, `win-cascade`, `win-dialog`,
  `win-score`, `win-new-game`, `lost-dialog`, `lost-close`, `lost-new-game`, `update-reload`, `install`. Renaming one breaks `tests/ui`.
- Dev server (only if the user asks): `npm run dev -- -p 3012`.
