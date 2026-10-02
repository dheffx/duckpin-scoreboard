# Duckpin Scoreboard development guide

## Commands

- Requires Node.js 20 or newer. Run all scoring tests with `npm test`.
- Run one named test with Node's test-name filter, for example:
  ```sh
  node --test --test-name-pattern="^scores tenth-frame strike and spare bonuses$" tests/scoring.test.mjs
  ```
- Serve the dependency-free static app locally with `npm start` (or `python3 -m http.server 4173`) and open `http://localhost:4173`.
- There is no build step, package lockfile, or configured linter. Source files are served directly.

## Architecture

- `index.html` loads the plain ES-module application directly; `src/app.js` owns the browser UI, screen navigation, input handlers, local state, localStorage persistence, import/export, device feedback, and rendering. Screens are rebuilt by assigning `#app.innerHTML`, then wiring listeners for the new elements in the corresponding `render*` function.
- Keep duckpin game rules in `src/scoring.js`. It exports pure functions over a ten-element array of frame arrays. `src/app.js` consumes those functions to validate entry, advance turns, calculate scores, and render scorecards. Test rule changes in `tests/scoring.test.mjs` with `node:test`; do not embed alternate scoring logic in the UI.
- The app has no backend. The active game, completed-game history, saved rosters, last roster, and preferences are separate versioned localStorage records in `app.js`. Completed games are capped at 12 and saved rosters at 8. History imports validate their JSON payload, merge by game ID, and preserve the newest-first ordering.
- Offline support is a service worker in `sw.js`: network-first requests populate the named cache, and cached responses provide the offline fallback. `manifest.webmanifest`, `index.html`, `src/app.js`, and `sw.js` together form the installable PWA surface.

## Repository-specific conventions

- Duckpin differs from ten-pin: regular frames allow up to three balls; a first-ball strike earns two following-ball bonuses, a two-ball spare earns one, and a three-ball ten earns no bonus. The tenth frame permits two bonus balls after a strike and one after a spare. Preserve the pin-reset constraint after a tenth-frame strike; it is covered by tests.
- When adding or changing rendered user-controlled or persisted text, pass it through `escapeHtml()` before interpolating it into an HTML template. Imported history must go through `sanitizeImportedGame()` before persistence.
- Treat `state.rollHistory` as part of the active-game data model. `addRoll()` appends `{ playerId, frameIndex }`, and `undoRoll()` uses it to restore the correct player after deferred turns. Persist state with `saveGame()` after mutations that must survive refreshes.
- Maintain the existing responsive, touch-first UI patterns in `src/style.css`: the layout supports a 320px minimum width, horizontal scrolling scorecards, keyboard focus indicators, coarse-pointer controls, and a complete `[data-theme="dark"]` override set. Add matching dark-theme styling for new light-surface UI.
- Cache-busting is deliberately coordinated. When static app-shell content changes, update the shared `v=18` URL suffixes in `index.html`, module imports in `src/app.js`, manifest icon URLs, and `sw.js`, update `CACHE_NAME` to the matching release, and keep every required static asset in `APP_SHELL`. This ensures installed clients receive the new shell rather than an old cache.
