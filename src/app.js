import {
  FRAME_COUNT,
  createFrames,
  formatRoll,
  gameTotal,
  isFrameComplete,
  nextPlayerIndex,
  nextRoll,
  scoreFrames
} from "./scoring.js";

const STORAGE_KEY = "duckpin-scoreboard-active-v1";
const HISTORY_KEY = "duckpin-scoreboard-history-v1";
const COLORS = ["#e95d47", "#277da1", "#7a5195", "#43aa8b", "#f4a261", "#577590"];

const app = document.querySelector("#app");
let state = loadActiveGame();

function loadActiveGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.players?.length) {
      const selectedPlayerIndex = saved.players.findIndex((player) => player.id === saved.selectedPlayerId);
      if (
        !Number.isInteger(saved.activePlayerIndex) ||
        saved.activePlayerIndex < 0 ||
        saved.activePlayerIndex >= saved.players.length
      ) {
        saved.activePlayerIndex = selectedPlayerIndex >= 0 ? selectedPlayerIndex : 0;
      }
      if (!Array.isArray(saved.rollHistory)) saved.rollHistory = [];
      return saved;
    }
  } catch (error) {
    console.warn("Could not restore the saved game.", error);
  }
  return null;
}

function saveGame() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newGame(playerNames) {
  state = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    players: playerNames.map((name, index) => ({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${index}`,
      name,
      color: COLORS[index % COLORS.length],
      frames: createFrames()
    })),
    activePlayerIndex: 0,
    rollHistory: [],
    savedToHistory: false
  };
  saveGame();
  render();
}

function activePlayer() {
  return state.players[state.activePlayerIndex] ?? state.players[0];
}

function isGameComplete() {
  return state.players.every((player) => isFrameComplete(player.frames[9], 9));
}

function persistCompletedGame() {
  if (!isGameComplete() || state.savedToHistory) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [];
  } catch (error) {
    console.warn("Could not load game history.", error);
  }
  history.unshift({
    id: state.id,
    playedAt: state.createdAt,
    players: state.players.map(({ name, frames }) => ({ name, total: gameTotal(frames) }))
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
  state.savedToHistory = true;
  saveGame();
}

function addRoll(pins) {
  const player = activePlayer();
  const turn = nextRoll(player.frames);
  if (!turn || pins < 0 || pins > turn.maxPins) return;
  player.frames[turn.frameIndex].push(pins);
  state.rollHistory.push({ playerId: player.id, frameIndex: turn.frameIndex });
  if (isFrameComplete(player.frames[turn.frameIndex], turn.frameIndex)) {
    state.activePlayerIndex = nextPlayerIndex(state.players, state.activePlayerIndex);
  }
  persistCompletedGame();
  saveGame();
  render();
}

function undoRoll() {
  const previousRoll = state.rollHistory.pop();
  let player;
  let frame;

  if (previousRoll) {
    const playerIndex = state.players.findIndex((item) => item.id === previousRoll.playerId);
    if (playerIndex >= 0) {
      player = state.players[playerIndex];
      frame = player.frames[previousRoll.frameIndex];
      state.activePlayerIndex = playerIndex;
    }
  } else {
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const playerIndex = (state.activePlayerIndex - offset + state.players.length) % state.players.length;
      const candidate = state.players[playerIndex];
      let frameIndex = -1;
      for (let index = candidate.frames.length - 1; index >= 0; index -= 1) {
        if (candidate.frames[index].length) {
          frameIndex = index;
          break;
        }
      }
      if (frameIndex >= 0) {
        player = candidate;
        frame = candidate.frames[frameIndex];
        state.activePlayerIndex = playerIndex;
        break;
      }
    }
  }

  if (!frame?.length) return;
  frame.pop();
  state.savedToHistory = false;
  saveGame();
  render();
}

function scoreText(player) {
  const total = gameTotal(player.frames);
  return total === null ? "—" : total;
}

function rollCells(frame, frameIndex) {
  const cellCount = frameIndex === 9 ? 3 : isFrameComplete(frame, frameIndex) && frame[0] === 10 ? 1 : 3;
  return Array.from({ length: cellCount }, (_, rollIndex) => {
    const value = formatRoll(frame, rollIndex, frameIndex);
    return `<span class="roll ${value === "X" || value === "/" ? "mark" : ""}">${value}</span>`;
  }).join("");
}

function scorecard(player, isActive) {
  const scores = scoreFrames(player.frames);
  return `
    <section class="scorecard ${isActive ? "active" : ""}" aria-label="${escapeHtml(player.name)}'s scorecard">
      <div class="scorecard-title">
        <span class="player-dot" style="--player-color:${player.color}"></span>
        <span>${escapeHtml(player.name)}</span>
        <strong>${scoreText(player)}</strong>
      </div>
      <div class="frames">
        ${player.frames
          .map(
            (frame, index) => `
              <article class="frame ${index === 9 ? "tenth" : ""}">
                <div class="frame-number">${index + 1}</div>
                <div class="rolls">${rollCells(frame, index)}</div>
                <div class="cumulative">${scores[index].cumulative ?? ""}</div>
              </article>`
          )
          .join("")}
      </div>
    </section>`;
}

function turnDescription(player) {
  const turn = nextRoll(player.frames);
  if (!turn) return `${player.name} is finished`;
  const rollLabel = ["first", "second", "third"][turn.rollIndex];
  return `Frame ${turn.frameIndex + 1} · ${rollLabel} ball · up to ${turn.maxPins} pins`;
}

function renderSetup() {
  app.innerHTML = `
    <main class="setup-shell">
      <section class="hero">
        <div class="app-mark" aria-hidden="true">●</div>
        <p class="eyebrow">Duckpin scorekeeper</p>
        <h1>Keep the game moving.</h1>
        <p class="hero-copy">A fast, beautiful scorecard built for three-ball duckpin games — even without signal.</p>
      </section>
      <section class="setup-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">New game</p>
            <h2>Who’s bowling?</h2>
          </div>
          <span class="player-count" id="player-count">2 players</span>
        </div>
        <form id="setup-form">
          <div id="player-fields" class="player-fields"></div>
          <button type="button" class="add-player" id="add-player">+ Add player</button>
          <button class="primary-button" type="submit">Start scoring <span>→</span></button>
        </form>
      </section>
      <p class="footer-note">Scores are stored privately on this device.</p>
    </main>`;

  const playerFields = document.querySelector("#player-fields");
  const count = document.querySelector("#player-count");
  let playerNames = ["Player 1", "Player 2"];
  const renderFields = () => {
    playerFields.innerHTML = playerNames.map((name, index) => `
      <label class="player-input">
        <span class="color-swatch" style="--player-color:${COLORS[index % COLORS.length]}"></span>
        <input required maxlength="22" value="${escapeHtml(name)}" aria-label="Player ${index + 1} name" />
      </label>
    `).join("");
    count.textContent = `${playerNames.length} ${playerNames.length === 1 ? "player" : "players"}`;
    document.querySelector("#add-player").hidden = playerNames.length >= 6;
  };
  renderFields();

  document.querySelector("#add-player").addEventListener("click", () => {
    playerNames = [...playerFields.querySelectorAll("input")].map((input) => input.value);
    playerNames.push(`Player ${playerNames.length + 1}`);
    renderFields();
  });
  document.querySelector("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const names = [...playerFields.querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
    if (names.length) newGame(names);
  });
}

function renderGame() {
  const player = activePlayer();
  const turn = nextRoll(player.frames);
  const complete = isGameComplete();
  app.innerHTML = `
    <main class="game-shell">
      <header class="game-header">
        <button class="logo-button" id="restart" aria-label="Start a new game">
          <span class="mini-mark">●</span><span>Duckpin</span>
        </button>
        <button class="text-button" id="share">Share</button>
      </header>
      <section class="score-header">
        <p class="eyebrow">${complete ? "Final scores" : "Live scorecard"}</p>
        <h1>${complete ? "Great game." : "Keep rolling."}</h1>
      </section>
      <nav class="player-tabs" aria-label="Player scores">
        ${state.players
          .map(
            (item) => `
              <div class="player-tab ${item.id === player.id ? "selected" : ""}" ${item.id === player.id ? 'aria-current="true"' : ""}>
                <span style="--player-color:${item.color}"></span>${escapeHtml(item.name)}
                <b>${scoreText(item)}</b>
              </div>`
          )
          .join("")}
      </nav>
      <section class="scorecards">
        ${state.players.map((item) => scorecard(item, item.id === player.id)).join("")}
      </section>
      ${
        complete
          ? `<section class="complete-card">
              <span class="complete-icon">★</span>
              <div><strong>Scorecards saved</strong><p>Share the results, then start the next game.</p></div>
              <button class="primary-button compact" id="new-game">New game</button>
            </section>`
          : `<section class="entry-panel">
              <div class="turn-label">
                <span class="player-dot" style="--player-color:${player.color}"></span>
                <div><strong>${escapeHtml(player.name)}’s turn</strong><p>${turnDescription(player)}</p></div>
              </div>
              <div class="keypad" aria-label="Pins knocked down">
                ${Array.from({ length: 11 }, (_, pins) => `
                  <button class="pin-button ${pins > turn.maxPins ? "disabled" : ""}" data-pins="${pins}" ${pins > turn.maxPins ? "disabled" : ""}>${pins === 10 ? "X" : pins}</button>
                `).join("")}
                <button class="undo-button" id="undo" ${state.rollHistory.length || state.players.some((item) => item.frames.some((frame) => frame.length)) ? "" : "disabled"}>Undo last roll</button>
              </div>
            </section>`
      }
    </main>`;

  document.querySelector("#restart").addEventListener("click", renderSetup);
  document.querySelector("#share").addEventListener("click", shareGame);
  document.querySelector("#new-game")?.addEventListener("click", () => {
    state = null;
    localStorage.removeItem(STORAGE_KEY);
    renderSetup();
  });
  document.querySelector("#undo")?.addEventListener("click", undoRoll);
  document.querySelectorAll("[data-pins]").forEach((button) => {
    button.addEventListener("click", () => addRoll(Number(button.dataset.pins)));
  });
}

async function shareGame() {
  const lines = state.players.map((player) => `${player.name}: ${scoreText(player)}`);
  const text = `Duckpin scoreboard\n${lines.join("\n")}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Duckpin scoreboard", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    alert("Scoreboard copied to your clipboard.");
  } catch (error) {
    if (error.name !== "AbortError") console.error("Could not share the scoreboard.", error);
  }
}

function render() {
  if (state?.players?.length) renderGame();
  else renderSetup();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Offline support could not be enabled.", error);
  }));
}

render();
