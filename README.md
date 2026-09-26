# Duckpin Scoreboard

A fast, installable, browser-only scorekeeper for standard ten-frame duckpin bowling. It uses no backend: the active scorecard and recent completed games are stored in your browser's local storage.

Completed game history can be saved as a JSON file and loaded on another device from the setup screen. Imports merge games by ID, so loading the same export twice does not create duplicates.

Finished games include a winner/high-game summary, strike and spare leaders, and a frame-by-frame score progression. The setup screen remembers the latest group of players, lets you shuffle their bowling order, and keeps frequently used groups available as saved shortcuts.

The setup screen also shows the latest completed game. Preferences let each device choose system, light, or dark appearance and optionally enable haptic and sound feedback for entered rolls. Those cues are off by default; haptics run only when supported by the browser and are suppressed when reduced motion is enabled.

## Use it

Serve this directory over HTTPS (or `localhost`) with any static host, then open it on a phone and use the browser's **Install app** / **Add to Home Screen** action. GitHub Pages, Cloudflare Pages, Netlify, or any ordinary static file host will work.

For local development on a machine with Python:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The installed app uses the duck sprite as its home-screen icon.

## Duckpin scoring

- Every frame permits up to three balls.
- A first-ball strike scores 10 plus the following two balls.
- A two-ball spare scores 10 plus the following ball.
- Knocking down 10 pins across all three balls scores 10 without a bonus.
- The tenth frame grants two bonus balls after a strike and one after a spare.

The app includes this same rules reference from both the new-game and scoring screens. Its back link returns to the screen it was opened from without changing an active scorecard.

The **Share scores** button sends a plain-text snapshot of the current player totals through the device share sheet, or copies it to the clipboard when native sharing is unavailable.

To start completely fresh, use **Preferences → Clear all data**. The confirmation removes app data stored on that device but does not delete JSON history files previously exported.

## Tests

On a machine with Node.js 20 or newer:

```sh
npm test
```

The scoring tests cover opens, strikes, spares, three-ball tens, and tenth-frame bonus behavior.
