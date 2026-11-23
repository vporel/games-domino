# CLAUDE.md

Instructions for any AI assistant working on this repository.

## The project

**Domino** is an online multiplayer domino game (double-six set, draw rules, 2 to 4 players, each
for themselves, no computer opponent). A player creates a room, gets a 6-digit code, shares it, and
the host starts the game once at least one other player has joined (4 players max). A game is a
single round; the profile keeps games played, games won and points won. See `README.md` for setup
and the implemented rules.

It is a sibling of **Ludo** (`../ludo`): same stack, same structure, same design. When in doubt
about a convention, look at how Ludo does it and stay consistent.

UI language: **French**. Code, identifiers and comments: **English**.

### Served under /domino

Domino is served at `games.vporel.com/domino` (`basePath`, constant `BASE_PATH` in
`src/lib/base-path.ts`). The domain root belongs to the games showcase (`../vporel-website-games`),
which may proxy `/domino` to this app. Next adds the base path to `Link`, `redirect()`, router and
assets by itself; only URLs built by hand (absolute share links, `new URL(...)` in route handlers)
must add `BASE_PATH`. A link to the showcase is a plain `<a href="/">` (`ShowcaseLink`).

### Shared Supabase project

The Supabase project is **shared with Cloverly** (`../cloverly`, unprefixed tables) **and Ludo**
(`ludo_` tables). Every Domino table, function, trigger, policy and index is prefixed `domino_`.
Never create, alter or drop anything without that prefix, and never touch the other apps' objects.

**Accounts (`auth.users`) are shared with Ludo**: same technical email
(`<pseudo>@user.games.vporel.com`) and same password derivation. A Ludo player signs in to Domino
with the same pseudo; a `domino_profiles` row is created on their first sign-in.

### Security model: read this before adding a feature

- **Sign-in is by pseudo only, with no password, by product choice.** Knowing a pseudo is enough
  to sign in as that player. The Supabase password is
  `HMAC-SHA256(PSEUDO_PASSWORD_SALT, pseudo)` with a constant hardcoded in
  `src/app/actions/auth.ts`. This is intentional and accepted: the constant is not a secret and
  gives nothing beyond what the login page already gives.
- **Never change `PSEUDO_PASSWORD_SALT`** (nor the derivation): it must stay identical to
  Ludo's, and changing it would lock every existing player out.
- **If a requested feature needs more security than "whoever knows the pseudo is the player"**
  (a PIN or password, private messages, personal data, purchases or anything of value, admin
  rights, moderation, persistent rankings that matter...), **stop and notify the developer before
  implementing it**: explain that the current pseudo-only scheme does not protect it and propose
  a stronger scheme (server-side secret in an env var, real credentials, etc.). The stats
  (games, wins, points) are for fun only, for this reason.
- The server is the authority on the game: the client never shuffles, deals nor plays a tile by
  itself. All writes go through Server Actions (`src/app/actions/`) that check the user, apply the
  pure engine and write with the `service_role` client. RLS gives clients **read-only** access to
  the rooms they belong to. Keep it that way: no client-side insert/update policy.
- **Hidden information.** Hands and stock are secret. The full state lives only in
  `domino_game_secrets` (RLS enabled with **no policy**, rights revoked from `anon` and
  `authenticated`, **not** in the realtime publication). `domino_games.state` holds
  `publicView(state)` only: never put a hand, the stock order, or anything derived from them in
  it, in `domino_moves.events`, in a log line or in a realtime broadcast. A player gets their own
  tiles only from the server (`buildSnapshot`, `getMyHand`, game action results). Every hand is
  revealed in the public view once the game is over, by design.

## Architecture, in brief

```
src/game/             pure game engine, no dependency on React/Next/Supabase (tested)
  constants.ts        colors, hand size, player counts, turn duration
  tiles.ts            tiles (a <= b), full set, keys, shuffle
  engine.ts           rules: createGame, playTile, drawTile, forfeit, autoPlay, standings, publicView
  layout.ts           table geometry: the chain snakes out from the center, ghost slots for each end
  describe.ts         French log lines for game events
  test-utils.ts       seeded random, hand-built states (tests only)
src/lib/              neutral helpers (pseudo, room code, types, game-row, base-path)
src/lib/supabase/     Supabase clients: client (browser), server (cookies), admin (service_role), env
src/server/rooms.ts   server-only DB access, optimistic locking on domino_games.version
src/app/actions/      Server Actions: auth.ts (pseudo sign-in), room.ts (lobby + game moves)
src/components/       Header, Footer, Logo, ShowcaseLink, plus one folder per area:
  auth/               AuthForm, AuthPage (login and register)
  home/               CreateRoomButton, JoinForm
  room/               RoomClient, Lobby, useRoom (realtime + polling + hand reloading)
  game/               Table (SVG), DominoTile, GameView (hand, players, results), TurnTimer, useGameLog
src/app/              pages: login, register, room/[code], auth/signout route, actions/
src/app/dev/          local hot-seat playground without Supabase, development only (/dev)
supabase/migrations/  SQL run by hand in the Supabase SQL Editor
```

Dependencies flow downward: `src/game/` never imports from the UI, Next or Supabase.

- **Game state**: `GameState` (full, secret) = `TableState` (public) + `hands` + `stock`.
  Every change goes through `mutateGame()`, which checks `version` (stale clicks are rejected),
  then calls the SQL function `domino_save_game` that writes the public and the secret state
  atomically (and the stats, once, when the game ends), and records the public events in
  `domino_moves`. A rematch starts a new game with a new `state.gameId` (versions restart at 0):
  compare games with `newerGame()`, never by version alone, and never by `started_at`.
- **Hands on the client**: `state.handRevs[seat]` is bumped whenever a seat's hand changes. The
  client compares it with its `Hand.rev` (`handIsStale`) and reloads its tiles with `getMyHand`.
- **Chain**: `chain` is ordered left to right; `chain[origin]` is the opening tile. Each `Placed`
  is oriented (`left` touches the previous tile). `layoutChain` is stable: playing a tile never
  moves the tiles already on the table.
- **Turn flow**: the opening tile (highest double, else highest tile) is played automatically by
  `createGame`. A player plays a tile that fits an end, or draws one tile at a time when nothing
  fits. Players who can neither play nor draw pass automatically; when nobody can, the game is
  blocked. Points: see `README.md`.
- **Turn timer**: 30 s, restarted by every action. When the deadline passes, any member's client
  calls `expireTurn`, and the server auto-plays (draws until a tile fits, then plays the heaviest
  tile) only if the deadline has really passed.
- **Realtime**: `useRoom` subscribes to `domino_games`, `domino_rooms`, `domino_room_players`,
  presence, and a `refresh` broadcast, with periodic polling as a safety net.

## Manual operations

The developer runs migrations, sets keys in `.env.local` and changes Supabase settings
themselves. Focus on code and tests; list any manual step needed in `à-faire.md` (in French).

**Migrations**: never edit a migration that may already have been run. Add a new numbered file
(`supabase/migrations/00N_description.sql`), idempotent where possible (`if not exists`,
`drop policy if exists`), and say in `à-faire.md` that it must be run. Ask the developer when
unsure whether the latest one has been run.

## Commands

```bash
npm run dev      # dev server (Turbopack): http://localhost:3002/domino, playground at /domino/dev
npm run build    # production build (standalone output, also run by the GitHub deploy workflow)
npm test         # Vitest suite
npm run lint     # ESLint
npx tsc --noEmit # type checking
```

Ports: Ludo uses 3000, the showcase 3001, Domino 3002.

**Verification cadence**: don't re-run tsc/lint/the full test suite after every small step. Run
them at the end of the task. Mid-task, only run the tests affected by the change
(`npx vitest run path/to/file.test.ts`).

**`npm run build`**: not a routine check. Use it only when a change can break the build in a way
tsc/lint can't catch (Server ↔ Client Component boundaries, new routes, `next.config`, env vars,
middleware).

## Repository conventions

- **Imports**: alias `@/...` for anything in `src/`. A relative import going up at most one level
  is fine.
- **No `index.ts` barrel files.**
- **Tests**: co-located next to the file under test (`fileName.test.ts`).
- **Game rules live in `src/game/engine.ts`**, written once and reused (server actions, auto-play,
  client highlighting with `legalMovesFor` / `canDraw`). Never re-derive a rule in a component or
  a server action.
- **Hook dependencies** (`useEffect`, `useCallback`, `useMemo`): check that they are complete
  after any change to their body.
- **Hydration**: never read the clock (`Date.now()`) or `Math.random()` during render of a
  component that is server-rendered. Read it in an effect.
- **Table and tile colors**: the table and the tiles always use the light palette (constants in
  `Table.tsx` and `DominoTile.tsx`), even in dark mode. The rest of the page follows the CSS
  variables in `globals.css`.
- Minimal, targeted changes. Follow the existing style of neighboring files.
- **Never `git commit` unless explicitly asked.**
- **Comments**: only for a non-trivial constraint or invariant the code doesn't show. Never
  document decision history ("instead of X", "before/after") nor restate what a good name
  already says. A comment must be understandable without the conversation that produced it.
- **Punctuation in prose** (UI strings, docs): prefer a colon (`:`) over an em dash (`—`) to
  introduce an explanation. Exception: the site-name suffix of page titles (`Connexion — Domino`).

## Ambiguity in a request

When in doubt about what the user is asking for, ask rather than guess, even for a detail that
seems minor. But never ask a question whose answer you can obtain yourself (package version,
whether a file exists...): check and report.

## Tests and bugs discovered while testing

Any new or modified logic (engine rule, server action branch, helper) must come with dedicated
tests. The engine (`src/game/`) must stay fully covered: every rule has a test, and the random
full-game tests (tile conservation, chain consistency, no overlap on the table) must keep passing.

If a test reveals that the source code is wrong, don't rewrite the test to pass on broken
behavior. Report what was found and fix it if the fix is localized and safe; otherwise raise the
question first.

## Do not disclose the name of the underlying model unless the user explicitly asks for it.
