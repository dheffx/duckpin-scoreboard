import {
  FRAME_COUNT,
  createFrames,
  frameStats,
  formatRoll,
  gameTotal,
  isFrameComplete,
  liveScore,
  nextPlayerIndex,
  nextRoll,
  scoreFrames
} from "./scoring.js?v=21";

const STORAGE_KEY = "duckpin-scoreboard-active-v1";
const HISTORY_KEY = "duckpin-scoreboard-history-v1";
const ROSTERS_KEY = "duckpin-scoreboard-rosters-v1";
const LAST_ROSTER_KEY = "duckpin-scoreboard-last-roster-v1";
const SETTINGS_KEY = "duckpin-scoreboard-settings-v1";
const COLORS = ["#e95d47", "#277da1", "#7a5195", "#43aa8b", "#f4a261", "#577590"];

const app = document.querySelector("#app");
const colorSchemeMedia = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
let state = loadActiveGame();
let celebration = null;
let celebrationTimer = null;
let shareFeedback = null;
let settings = loadSettings();
let audioContext = null;
const GUTTER_TAUNTS = [
  "The pins are having a very quiet moment.",
  "A strategic pause for the next frame.",
  "The lane won that round. It happens.",
  "Saving those pins for later? Fair enough."
];

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

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      haptics: Boolean(saved?.haptics),
      sound: Boolean(saved?.sound),
      theme: ["system", "light", "dark"].includes(saved?.theme) ? saved.theme : "system"
    };
  } catch (error) {
    console.warn("Could not load preferences.", error);
    return { haptics: false, sound: false, theme: "system" };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyTheme() {
  const systemDark = colorSchemeMedia?.matches;
  const isDark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#081a2c" : "#102a43");
}

function updateSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  saveSettings();
  applyTheme();
}

function clearAllAppData() {
  if (
    !window.confirm(
      "Clear all Duckpin app data from this device? This permanently removes the current scorecard, game history, saved player groups, and preferences. Exported JSON files are not deleted."
    )
  ) {
    return;
  }

  [STORAGE_KEY, HISTORY_KEY, ROSTERS_KEY, LAST_ROSTER_KEY, SETTINGS_KEY].forEach((key) => {
    localStorage.removeItem(key);
  });
  state = null;
  dismissCelebration();
  shareFeedback = null;
  settings = { haptics: false, sound: false, theme: "system" };
  audioContext = null;
  applyTheme();
  renderSetup();
}

function dismissCelebration() {
  if (celebrationTimer !== null) window.clearTimeout(celebrationTimer);
  celebrationTimer = null;
  celebration = null;
}

function showCelebration(nextCelebration) {
  dismissCelebration();
  const timedCelebration = { ...nextCelebration, startedAt: Date.now() };
  celebration = timedCelebration;
  celebrationTimer = window.setTimeout(() => {
    if (celebration === timedCelebration) {
      celebration = null;
      celebrationTimer = null;
      render();
    }
  }, 5000);
}

function loadStoredList(key, message) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn(message, error);
    return [];
  }
}

function loadHistory() {
  return loadStoredList(HISTORY_KEY, "Could not load game history.");
}

function loadRosters() {
  return loadStoredList(ROSTERS_KEY, "Could not load saved player groups.");
}

function loadLastRoster() {
  try {
    const roster = JSON.parse(localStorage.getItem(LAST_ROSTER_KEY));
    if (
      Array.isArray(roster) &&
      roster.length >= 1 &&
      roster.length <= 6 &&
      roster.every((name) => typeof name === "string" && name.trim())
    ) {
      return roster;
    }
  } catch (error) {
    console.warn("Could not load the last player group.", error);
  }
  return null;
}

function saveLastRoster(names) {
  localStorage.setItem(LAST_ROSTER_KEY, JSON.stringify(names));
}

function rosterSignature(names) {
  return names.map((name) => name.toLocaleLowerCase()).join("\u0000");
}

function saveRoster(names) {
  if (!names.length || names.every((name, index) => name === `Player ${index + 1}`)) return;

  const signature = rosterSignature(names);
  const rosters = loadRosters().filter(
    (roster) => rosterSignature(roster.names ?? []) !== signature
  );
  rosters.unshift({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, names });
  localStorage.setItem(ROSTERS_KEY, JSON.stringify(rosters.slice(0, 8)));
}

function exportHistory() {
  const payload = {
    format: "duckpin-scoreboard-history",
    version: 1,
    exportedAt: new Date().toISOString(),
    games: loadHistory()
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `duckpin-history-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeImportedGame(game) {
  if (!game || typeof game.id !== "string" || !Array.isArray(game.players) || !game.players.length) {
    throw new Error("Each game needs an ID and at least one player.");
  }

  const players = game.players.map((player, index) => {
    if (!player || typeof player.name !== "string" || !Number.isFinite(player.total)) {
      throw new Error("Each player needs a name and final score.");
    }
    if (
      player.frames !== undefined &&
      (!Array.isArray(player.frames) ||
        player.frames.length !== FRAME_COUNT ||
        player.frames.some(
          (frame) =>
            !Array.isArray(frame) ||
            frame.length > 3 ||
            frame.some((pins) => !Number.isInteger(pins) || pins < 0 || pins > 10)
        ))
    ) {
      throw new Error("A scorecard contains invalid frame data.");
    }

    return {
      name: player.name,
      color: COLORS[index % COLORS.length],
      total: player.total,
      ...(player.frames ? { frames: player.frames.map((frame) => [...frame]) } : {})
    };
  });

  return {
    id: game.id,
    playedAt: typeof game.playedAt === "string" ? game.playedAt : new Date().toISOString(),
    gameNumber: Number.isInteger(game.gameNumber) ? game.gameNumber : undefined,
    title: typeof game.title === "string" ? game.title : "",
    venue: typeof game.venue === "string" ? game.venue : "",
    players
  };
}

async function importHistory(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    if (file.size > 2_000_000) throw new Error("That file is too large to be a Duckpin history export.");
    const payload = JSON.parse(await file.text());
    if (
      !payload ||
      (payload.format !== "duckpin-scoreboard-history" && !Array.isArray(payload)) ||
      (!Array.isArray(payload) && payload.version !== 1) ||
      !Array.isArray(Array.isArray(payload) ? payload : payload.games)
    ) {
      throw new Error("Choose a Duckpin Scoreboard history JSON file.");
    }

    const importedGames = (Array.isArray(payload) ? payload : payload.games).map(sanitizeImportedGame);
    const existingGames = loadHistory();
    const existingIds = new Set(existingGames.map((game) => game.id));
    const newGames = importedGames.filter((game) => !existingIds.has(game.id));
    const mergedGames = [...newGames, ...existingGames].sort(
      (first, second) => new Date(second.playedAt).valueOf() - new Date(first.playedAt).valueOf()
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(mergedGames));
    alert(
      newGames.length
        ? `Loaded ${newGames.length} new ${newGames.length === 1 ? "game" : "games"}.`
        : "No new games were found in that file."
    );
  } catch (error) {
    console.error("Could not import game history.", error);
    alert(`Could not load history: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newGame(playerNames, details = {}) {
  const history = loadHistory();
  state = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    gameNumber: history.length + 1,
    title: details.title ?? "",
    venue: details.venue ?? "",
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
  saveLastRoster(playerNames);
  saveRoster(playerNames);
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

  const history = loadHistory();
  history.unshift({
    id: state.id,
    playedAt: state.createdAt,
    gameNumber: state.gameNumber,
    title: state.title,
    venue: state.venue,
    players: state.players.map(({ name, color, frames }) => ({
      name,
      color,
      frames: frames.map((frame) => [...frame]),
      total: gameTotal(frames)
    }))
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
  state.savedToHistory = true;
  saveGame();
}

function provideHaptics(type) {
  if (
    !settings.haptics ||
    !navigator.vibrate ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  const patterns = {
    roll: 12,
    spare: [16, 42, 16],
    strike: [22, 35, 22, 35, 35]
  };
  navigator.vibrate(patterns[type]);
}

function provideSound(type) {
  if (!settings.sound) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") void audioContext.resume();

  const notes = {
    roll: [{ frequency: 330, duration: 0.06 }],
    spare: [
      { frequency: 392, duration: 0.08 },
      { frequency: 494, duration: 0.12, offset: 0.07 }
    ],
    strike: [
      { frequency: 392, duration: 0.09 },
      { frequency: 523, duration: 0.11, offset: 0.08 },
      { frequency: 659, duration: 0.16, offset: 0.17 }
    ]
  };
  const start = audioContext.currentTime;

  notes[type].forEach(({ frequency, duration, offset = 0 }) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = start + offset;
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.025, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + duration);
  });
}

function provideRollFeedback(type) {
  provideHaptics(type);
  provideSound(type);
}

function completedSpecialFrameType(frame, frameIndex) {
  if (!isFrameComplete(frame, frameIndex)) return null;
  if (frame[0] === 10) return "strike";
  if (frame.length >= 2 && frame[0] + frame[1] === 10) return "spare";
  return null;
}

function consecutiveSpecialFrames(frames, completedFrameIndex) {
  let count = 0;
  for (let frameIndex = completedFrameIndex; frameIndex >= 0; frameIndex -= 1) {
    if (!completedSpecialFrameType(frames[frameIndex], frameIndex)) break;
    count += 1;
  }
  return count;
}

function completionAnnouncement(player, frame, frameIndex) {
  const type = completedSpecialFrameType(frame, frameIndex);
  if (type) {
    const streak = consecutiveSpecialFrames(player.frames, frameIndex);
    const label = type === "strike" ? "Strike!" : "Spare!";
    const headline = streak >= 4
      ? "GODLIKE!"
      : streak === 3
        ? "UNSTOPPABLE!"
        : streak === 2
          ? "INCREDIBLE!"
          : "AMAZING!";
    const detail = streak >= 4
      ? `${label} Keep the streak alive.`
      : streak === 3
        ? `${label} Three in a row!`
        : streak === 2
          ? `${label} Two in a row!`
          : type === "strike"
            ? "Strike! What a start."
            : "Spare! Nice pickup.";
    return {
      type,
      playerName: player.name,
      headline,
      detail,
      streak: Math.min(streak, 4)
    };
  }

  if (
    frameIndex < FRAME_COUNT - 1 &&
    frame.length === 3 &&
    frame.every((pins) => pins === 0)
  ) {
    return {
      type: "gutter",
      playerName: player.name,
      headline: "A quiet frame",
      detail: GUTTER_TAUNTS[Math.floor(Math.random() * GUTTER_TAUNTS.length)]
    };
  }

  return null;
}

function addRoll(pins) {
  const player = activePlayer();
  const turn = nextRoll(player.frames);
  if (!turn || pins < 0 || pins > turn.maxPins) return;
  player.frames[turn.frameIndex].push(pins);
  shareFeedback = null;
  const frame = player.frames[turn.frameIndex];
  let feedbackType = "roll";
  state.rollHistory.push({ playerId: player.id, frameIndex: turn.frameIndex });
  if (isFrameComplete(frame, turn.frameIndex)) {
    const announcement = completionAnnouncement(player, frame, turn.frameIndex);
    if (announcement) {
      showCelebration(announcement);
      if (announcement.type === "strike" || announcement.type === "spare") {
        feedbackType = announcement.type;
      }
    }
    state.activePlayerIndex = nextPlayerIndex(state.players, state.activePlayerIndex);
  }
  provideRollFeedback(feedbackType);
  persistCompletedGame();
  saveGame();
  render();
}

function deferActiveTurn() {
  const nextIndex = nextPlayerIndex(state.players, state.activePlayerIndex);
  if (nextIndex === state.activePlayerIndex) return;

  state.activePlayerIndex = nextIndex;
  dismissCelebration();
  shareFeedback = null;
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
  dismissCelebration();
  shareFeedback = null;
  state.savedToHistory = false;
  saveGame();
  render();
}

function resetGame() {
  const hasScores = state.players.some((player) => player.frames.some((frame) => frame.length));
  if (
    hasScores &&
    !window.confirm("Start a new game? This clears the current scorecard on this device. Completed games stay saved.")
  ) {
    return;
  }
  dismissCelebration();
  state = null;
  localStorage.removeItem(STORAGE_KEY);
  renderSetup();
}

function scoreText(player) {
  const total = gameTotal(player.frames);
  return total === null ? "—" : total;
}

function completePlayerData(players) {
  return players.map((player) => {
    const scores = scoreFrames(player.frames);
    return {
      ...player,
      total: Number.isFinite(player.total) ? player.total : gameTotal(player.frames),
      stats: frameStats(player.frames),
      progress: scores.map((score) => score.cumulative ?? 0)
    };
  });
}

function rankedPlayers(players, scoreForPlayer) {
  const sortedPlayers = players
    .map((player, index) => ({
      ...player,
      rankingScore: scoreForPlayer(player),
      originalIndex: index
    }))
    .sort(
      (first, second) =>
        second.rankingScore.total - first.rankingScore.total || first.originalIndex - second.originalIndex
    );

  let previousTotal = null;
  let rank = 0;
  return sortedPlayers.map((player, index) => {
    if (index === 0 || player.rankingScore.total !== previousTotal) rank = index + 1;
    previousTotal = player.rankingScore.total;
    return { ...player, rank };
  });
}

function liveStandings(players) {
  const standings = rankedPlayers(players, (player) => liveScore(player.frames));

  return `
    <section class="final-rankings live-standings" aria-label="Live standings">
      <div class="final-rankings-heading">
        <div><p class="eyebrow">Live score update</p><h2>Standings</h2></div>
        <span>Score</span>
      </div>
      <ol class="ranking-list">
        ${standings
          .map(
            (player, index) => `
              <li>
                <span class="ranking-place">${player.rank}</span>
                <span class="player-dot" style="--player-color:${player.color ?? COLORS[index % COLORS.length]}"></span>
                <strong>${escapeHtml(player.name)}</strong>
                <b class="${player.rankingScore.hasPendingBonus ? "at-least-score" : ""}">${
                  player.rankingScore.hasPendingBonus
                    ? `<span>At least</span> ${player.rankingScore.total}`
                    : player.rankingScore.total
                }</b>
              </li>`
          )
          .join("")}
      </ol>
    </section>`;
}

function statLeaders(players, stat) {
  const highest = Math.max(...players.map((player) => player.stats[stat]));
  if (!highest) return "None";
  const names = players
    .filter((player) => player.stats[stat] === highest)
    .map((player) => escapeHtml(player.name))
    .join(" & ");
  return `${names} (${highest})`;
}

function gameSummary(players) {
  if (!players.length || players.some((player) => !Array.isArray(player.frames))) return "";

  const scoredPlayers = completePlayerData(players);
  const highGame = Math.max(...scoredPlayers.map((player) => player.total));
  const winners = scoredPlayers
    .filter((player) => player.total === highGame)
    .map((player) => escapeHtml(player.name))
    .join(" & ");
  const chartMaximum = Math.max(highGame, 1);

  return `
    <section class="game-summary" aria-label="Game summary">
      <div class="summary-heading">
        <div>
          <p class="eyebrow">Game summary</p>
          <h2>${winners} ${winners.includes(" & ") ? "tie" : "wins"}</h2>
        </div>
        <strong class="summary-score">${highGame}</strong>
      </div>
      <dl class="summary-stats">
        <div><dt>High game</dt><dd>${highGame}</dd></div>
        <div><dt>Most strikes</dt><dd>${statLeaders(scoredPlayers, "strikes")}</dd></div>
        <div><dt>Most spares</dt><dd>${statLeaders(scoredPlayers, "spares")}</dd></div>
      </dl>
      <div class="progression-heading">
        <strong>Score through each frame</strong>
        <span>Frame</span>
      </div>
      <div class="progression-chart">
        ${scoredPlayers
          .map(
            (player, playerIndex) => `
              <div class="progression-player">
                <div class="progression-player-name">
                  <span class="player-dot" style="--player-color:${player.color ?? COLORS[playerIndex % COLORS.length]}"></span>
                  <strong>${escapeHtml(player.name)}</strong>
                  <span>${player.stats.strikes} X · ${player.stats.spares} /</span>
                </div>
                <ol class="progression-points" aria-label="${escapeHtml(player.name)} score progression">
                  ${player.progress
                    .map(
                      (score, frameIndex) => `
                        <li title="Frame ${frameIndex + 1}: ${score}">
                          <span class="progression-bar" style="--progress:${Math.max(8, Math.round((score / chartMaximum) * 100))}%;--progress-color:${player.color ?? COLORS[playerIndex % COLORS.length]}"></span>
                          <b>${score}</b>
                          <small>${frameIndex + 1}</small>
                        </li>`
                    )
                    .join("")}
                </ol>
              </div>`
          )
          .join("")}
      </div>
    </section>`;
}

function finalRankings(players) {
  const standings = rankedPlayers(
    completePlayerData(players),
    (player) => ({ total: player.total, isExact: true })
  );
  const winners = standings.filter((player) => player.rank === 1);
  const winnerNames = winners.map((player) => escapeHtml(player.name)).join(" & ");

  return `
    <section class="final-rankings" aria-label="Final rankings">
      <div class="final-rankings-heading">
        <div><p class="eyebrow">Final results</p><h2>Rankings</h2></div>
        <span>Score</span>
      </div>
      <div class="winner-scottie ${winners.length > 1 ? "tied" : ""}">
        <img src="./assets/winner-scottie.png" alt="${winnerNames} ${winners.length > 1 ? "are joint winners" : "is the winner"}" />
        <div>
          <strong>${winners.length > 1 ? "Joint winners" : "Winner"}</strong>
          <span>${winnerNames} ${winners.length > 1 ? "share the high score." : "takes the high score."}</span>
        </div>
      </div>
      <ol class="ranking-list">
        ${standings
          .map(
            (player, index) => `
              <li>
                <span class="ranking-place">${player.rank}</span>
                <span class="player-dot" style="--player-color:${player.color ?? COLORS[index % COLORS.length]}"></span>
                <strong>${escapeHtml(player.name)}</strong>
                <b>${player.total}</b>
              </li>`
          )
          .join("")}
      </ol>
    </section>`;
}

function lastGameCard(game) {
  if (!game?.players?.length) return "";

  const highGame = Math.max(...game.players.map((player) => player.total));
  const winners = game.players
    .filter((player) => player.total === highGame)
    .map((player) => escapeHtml(player.name))
    .join(" & ");
  return `
    <section class="last-game-card" aria-label="Last completed game">
      <div>
        <p class="eyebrow">Last game</p>
        <strong>${winners} ${winners.includes(" & ") ? "tied" : "won"} with ${highGame}</strong>
        <span>${escapeHtml(game.title || `Game ${game.gameNumber ?? ""}`)} · ${escapeHtml(formatGameDate(game.playedAt))}</span>
      </div>
      <button class="text-button" id="view-last-game">View</button>
    </section>`;
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
  const history = loadHistory();
  app.innerHTML = `
    <main class="setup-shell">
      <section class="hero">
        <div class="hero-sprites">
          <img class="hero-bowler" src="./assets/duckpin-bowler.png" alt="Pixel-art bowler throwing a duckpin bowling ball" />
          <img class="hero-duck" src="./assets/duckpin-duck.png" alt="Pixel-art duck knocked backward by a bowling ball" />
        </div>
        <h2>Duckpin scorekeeper</h2>
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
          <div id="saved-rosters" class="roster-section"></div>
          <div id="player-fields" class="player-fields"></div>
          <div class="setup-shortcuts">
            <button type="button" class="add-player" id="add-player">+ Add player</button>
            <button type="button" class="shuffle-button" id="shuffle-players">Shuffle order</button>
          </div>
          <div class="game-details">
            <label>
              <span>Game name <em>optional</em></span>
              <input id="game-title" maxlength="40" placeholder="Friday night duckpins" />
            </label>
            <label>
              <span>Venue <em>optional</em></span>
              <input id="game-venue" maxlength="40" placeholder="Your favorite alley" />
            </label>
          </div>
          <button class="primary-button" type="submit">Start scoring <span>→</span></button>
        </form>
      </section>
      ${lastGameCard(history[0])}
      <div class="history-actions">
        <button class="footer-link" id="view-history">View game history</button>
        <button class="footer-link" id="export-history">Save history</button>
        <button class="footer-link" id="import-history">Load history</button>
        <button class="footer-link" id="view-settings">Preferences</button>
        <button class="footer-link" id="view-rules">Rules reference</button>
        <input id="history-file" type="file" accept="application/json,.json" hidden />
      </div>
      <p class="footer-note">Scores are stored privately on this device.</p>
    </main>`;

  const playerFields = document.querySelector("#player-fields");
  const count = document.querySelector("#player-count");
  const savedRosters = document.querySelector("#saved-rosters");
  const rosters = loadRosters();
  let playerNames = loadLastRoster() ?? ["Player 1", "Player 2"];
  const syncPlayerNames = () => {
    playerNames = [...playerFields.querySelectorAll("input")].map((input) => input.value);
  };
  const renderFields = () => {
    playerFields.innerHTML = playerNames.map((name, index) => `
      <div class="player-input">
        <span class="color-swatch" style="--player-color:${COLORS[index % COLORS.length]}"></span>
        <input required maxlength="22" value="${escapeHtml(name)}" aria-label="Player ${index + 1} name" />
        ${
          playerNames.length > 1
            ? `<button type="button" class="remove-player" data-remove-player="${index}" aria-label="Remove ${escapeHtml(name || `player ${index + 1}`)}"><span aria-hidden="true">×</span></button>`
            : ""
        }
      </div>
    `).join("");
    count.textContent = `${playerNames.length} ${playerNames.length === 1 ? "player" : "players"}`;
    document.querySelector("#add-player").hidden = playerNames.length >= 6;
    document.querySelector("#shuffle-players").hidden = playerNames.length < 2;
  };
  renderFields();
  if (rosters.length) {
    savedRosters.innerHTML = `
      <p class="field-label">Saved groups</p>
      <div class="roster-list">
        ${rosters
          .map(
            (roster, index) => `
              <button type="button" class="roster-button" data-roster-index="${index}" aria-label="Copy saved group ${escapeHtml(roster.names.join(", "))} to the player list">
                <span>Copy</span>
                ${escapeHtml(roster.names.join(" · "))}
              </button>`
          )
          .join("")}
      </div>`;
  }

  document.querySelector("#add-player").addEventListener("click", () => {
    syncPlayerNames();
    playerNames.push(`Player ${playerNames.length + 1}`);
    renderFields();
  });
  document.querySelector("#shuffle-players").addEventListener("click", () => {
    syncPlayerNames();
    for (let index = playerNames.length - 1; index > 0; index -= 1) {
      const targetIndex = Math.floor(Math.random() * (index + 1));
      [playerNames[index], playerNames[targetIndex]] = [playerNames[targetIndex], playerNames[index]];
    }
    renderFields();
  });
  playerFields.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-player]");
    if (!removeButton || playerNames.length === 1) return;
    syncPlayerNames();
    playerNames.splice(Number(removeButton.dataset.removePlayer), 1);
    renderFields();
  });
  document.querySelectorAll("[data-roster-index]").forEach((button) => {
    button.addEventListener("click", () => {
      playerNames = [...rosters[Number(button.dataset.rosterIndex)].names];
      renderFields();
    });
  });
  document.querySelector("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const names = [...playerFields.querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
    const title = document.querySelector("#game-title").value.trim();
    const venue = document.querySelector("#game-venue").value.trim();
    if (names.length) newGame(names, { title, venue });
  });
  document.querySelector("#view-history").addEventListener("click", () => renderHistory(false));
  document.querySelector("#view-last-game")?.addEventListener("click", () => renderHistory(false));
  document.querySelector("#export-history").addEventListener("click", exportHistory);
  document.querySelector("#import-history").addEventListener("click", () => {
    document.querySelector("#history-file").click();
  });
  document.querySelector("#history-file").addEventListener("change", importHistory);
  document.querySelector("#view-settings").addEventListener("click", renderSettings);
  document.querySelector("#view-rules").addEventListener("click", () => renderRules(false));
}

function renderSettings() {
  const rosters = loadRosters();
  app.innerHTML = `
    <main class="setup-shell preferences-shell">
      <header class="game-header">
        <div class="logo-button"><span class="logo-badge" aria-hidden="true">10</span><span>Duckpin</span></div>
        <button class="text-button" id="back-to-setup">Back</button>
      </header>
      <section class="score-header">
        <p class="eyebrow">On this device</p>
        <h1>Preferences</h1>
      </section>
      <section class="setup-card preferences-card">
        <div class="preference-row">
          <div><strong>Haptic feedback</strong><p>Light taps for rolls, with a bigger celebration for strikes and spares when your phone supports it.</p></div>
          <label class="switch"><input id="haptics" type="checkbox" ${settings.haptics ? "checked" : ""} /><span aria-hidden="true"></span><span class="sr-only">Enable haptic feedback</span></label>
        </div>
        <div class="preference-row">
          <div><strong>Sound effects</strong><p>Quiet roll and celebration tones. Sound stays off unless you enable it.</p></div>
          <label class="switch"><input id="sound" type="checkbox" ${settings.sound ? "checked" : ""} /><span aria-hidden="true"></span><span class="sr-only">Enable sound effects</span></label>
        </div>
        <label class="theme-select">
          <span><strong>Appearance</strong><small>Choose whether the app follows your device or stays light or dark.</small></span>
          <select id="theme">
            <option value="system" ${settings.theme === "system" ? "selected" : ""}>Use device setting</option>
            <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
            <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
          </select>
        </label>
      </section>
      <section class="setup-card saved-groups-manager">
        <p class="eyebrow">Saved groups</p>
        <h2>Manage groups</h2>
        ${
          rosters.length
            ? `<ul class="saved-group-list">
                ${rosters
                  .map(
                    (roster, index) => `
                      <li>
                        <span>${escapeHtml(roster.names.join(" · "))}</span>
                        <button type="button" class="remove-roster" data-remove-roster-index="${index}">Remove</button>
                      </li>`
                  )
                  .join("")}
              </ul>`
            : `<p class="empty-saved-groups">Groups saved from new games will appear here.</p>`
        }
      </section>
      <section class="danger-zone">
        <div><strong>Clear all app data</strong><p>Remove the current game, saved history, player groups, and preferences from this device.</p></div>
        <button class="clear-data-button" id="clear-all-data">Clear all data</button>
      </section>
      <p class="footer-note">Preferences are stored privately on this device.</p>
    </main>`;

  document.querySelector("#back-to-setup").addEventListener("click", renderSetup);
  document.querySelector("#haptics").addEventListener("change", (event) => {
    updateSettings({ haptics: event.target.checked });
  });
  document.querySelector("#sound").addEventListener("change", (event) => {
    updateSettings({ sound: event.target.checked });
  });
  document.querySelector("#theme").addEventListener("change", (event) => {
    updateSettings({ theme: event.target.value });
  });
  document.querySelector("#clear-all-data").addEventListener("click", clearAllAppData);
  document.querySelectorAll("[data-remove-roster-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const roster = rosters[Number(button.dataset.removeRosterIndex)];
      if (!roster || !window.confirm(`Remove saved group "${roster.names.join(" · ")}"?`)) return;

      const rosterKey = roster.id ?? rosterSignature(roster.names);
      const remainingRosters = loadRosters().filter(
        (candidate) => (candidate.id ?? rosterSignature(candidate.names ?? [])) !== rosterKey
      );
      localStorage.setItem(ROSTERS_KEY, JSON.stringify(remainingRosters));
      renderSettings();
    });
  });
}

function renderRules(returnToGame) {
  const backLabel = returnToGame ? "Back to game" : "Back to new game";
  app.innerHTML = `
    <main class="setup-shell rules-shell">
      <header class="game-header">
        <div class="logo-button"><span class="logo-badge" aria-hidden="true">10</span><span>Duckpin</span></div>
        <button class="text-button" id="back-from-rules">← ${backLabel}</button>
      </header>
      <section class="score-header">
        <p class="eyebrow">Quick reference</p>
        <h1>Duckpin rules</h1>
      </section>
      <section class="setup-card rules-card">
        <div class="rules-intro">
          <strong>Ten frames. Up to three balls per frame.</strong>
          <p>Knock down all 10 pins on an earlier ball to end the frame early.</p>
        </div>
        <ol class="rules-list">
          <li><strong>Strike <mark>X</mark></strong><span>All 10 pins on the first ball. Score 10 plus the next two balls.</span></li>
          <li><strong>Spare <mark>/</mark></strong><span>All 10 pins across the first two balls. Score 10 plus the next ball.</span></li>
          <li><strong>Three-ball ten</strong><span>All 10 pins across three balls. Score 10 with no bonus.</span></li>
          <li><strong>Open frame</strong><span>Pins remain after three balls. Score the pins knocked down.</span></li>
        </ol>
        <div class="rules-tenth">
          <p class="eyebrow">Frame 10</p>
          <p>A strike earns two bonus balls; a spare earns one. After a strike, the pins reset for the next bonus ball. If that ball is not a strike, the final ball can only knock down the pins still standing.</p>
        </div>
        <p class="rules-note">A perfect game is 300: twelve strikes in a row.</p>
      </section>
    </main>`;

  document.querySelector("#back-from-rules").addEventListener("click", () => {
    if (returnToGame && state?.players?.length) renderGame();
    else renderSetup();
  });
}

function formatGameDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Saved game";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderHistory(returnToGame = Boolean(state?.players?.length)) {
  const history = loadHistory();
  app.innerHTML = `
    <main class="history-shell">
      <header class="game-header">
        <div class="logo-button"><span class="logo-badge" aria-hidden="true">10</span><span>Duckpin</span></div>
        <button class="text-button" id="back-to-setup">Back</button>
      </header>
      <section class="score-header">
        <p class="eyebrow">On this device</p>
        <h1>Game history</h1>
      </section>
      ${
        history.length
          ? `<section class="history-list">
              ${history
                .map(
                  (game, index) => `
                    <details class="history-game" ${index === 0 ? "open" : ""}>
                      <summary>
                        <span><strong>${escapeHtml(game.title || `Game ${game.gameNumber ?? history.length - index}`)}</strong><small>${escapeHtml(formatGameDate(game.playedAt))}${game.venue ? ` · ${escapeHtml(game.venue)}` : ""}</small></span>
                        <span class="history-total">${game.players.map((player) => escapeHtml(player.total)).join(" · ")}</span>
                      </summary>
                      <div class="history-game-body">
                        ${gameSummary(game.players)}
                        ${
                          game.players.every((player) => Array.isArray(player.frames))
                            ? `<div class="scorecards">${game.players
                                .map((player, playerIndex) =>
                                  scorecard({ ...player, color: player.color ?? COLORS[playerIndex] }, false)
                                )
                                .join("")}</div>`
                            : `<ul class="history-player-totals">${game.players
                                .map((player) => `<li><span>${escapeHtml(player.name)}</span><strong>${escapeHtml(player.total)}</strong></li>`)
                                .join("")}</ul>`
                        }
                        <button class="delete-history-button" data-history-id="${escapeHtml(game.id)}">Delete game</button>
                      </div>
                    </details>`
                )
                .join("")}
            </section>`
          : `<section class="empty-history"><span>◌</span><h2>No finished games yet.</h2><p>Completed scorecards will appear here automatically.</p></section>`
      }
    </main>`;

  document.querySelector("#back-to-setup").addEventListener("click", () => {
    if (returnToGame) renderGame();
    else renderSetup();
  });
  document.querySelectorAll("[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("Delete this saved game?")) return;
      const nextHistory = loadHistory().filter((game) => game.id !== button.dataset.historyId);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      renderHistory(returnToGame);
    });
  });
}

function playersInTurnOrder() {
  if (isGameComplete()) return state.players;
  return state.players.map(
    (_, offset) => state.players[(state.activePlayerIndex + offset) % state.players.length]
  );
}

function renderGame() {
  const player = activePlayer();
  const turn = nextRoll(player.frames);
  const complete = isGameComplete();
  const orderedPlayers = playersInTurnOrder();
  const frameNumber = turn ? turn.frameIndex + 1 : FRAME_COUNT;
  const canDeferTurn = !complete && nextPlayerIndex(state.players, state.activePlayerIndex) !== state.activePlayerIndex;
  const gameLabel = `Game ${state.gameNumber ?? 1}${state.title ? ` · ${state.title}` : ""}`;
  app.innerHTML = `
    <main class="game-shell">
      ${
        celebration
          ? `<div class="celebration ${celebration.type} ${celebration.streak ? `streak-${celebration.streak}` : ""}" style="animation-delay:-${Math.min(Date.now() - celebration.startedAt, 5000)}ms" role="status" aria-live="polite">
              <img class="celebration-sprite" src="${
                celebration.type === "gutter"
                  ? "./assets/sad-scottie.png"
                  : `./assets/terrier-${celebration.type}.png`
              }" alt="" aria-hidden="true" />
              <div class="celebration-copy">
                <span class="celebration-burst" aria-hidden="true">${celebration.type === "gutter" ? "· · ·" : "✦ ✦ ✦"}</span>
                <strong>${escapeHtml(celebration.playerName)} · ${escapeHtml(celebration.headline)}</strong>
                <span>${escapeHtml(celebration.detail)}</span>
              </div>
            </div>`
          : ""
      }
      <header class="game-header">
        <div class="logo-button">
          <span class="logo-badge" aria-hidden="true">10</span><span>Duckpin</span>
        </div>
        <div class="header-actions">
          <button class="text-button" id="view-history">History</button>
          <button class="text-button" id="view-rules">Rules</button>
          <button class="text-button" data-new-game>New game</button>
          <button class="text-button" id="share" title="Share a text snapshot of the current scores">Share scores</button>
        </div>
      </header>
      ${
        shareFeedback
          ? `<p class="share-feedback ${shareFeedback.type}" role="status">${escapeHtml(shareFeedback.message)}</p>`
          : ""
      }
      <section class="score-header">
        <p class="eyebrow">${complete ? `${gameLabel} · final scores` : `${gameLabel} · frame ${frameNumber} of ${FRAME_COUNT}`}</p>
        <h1>${complete ? "Great game." : `${escapeHtml(player.name)} is bowling.`}</h1>
        ${state.venue ? `<p class="game-venue">${escapeHtml(state.venue)}</p>` : ""}
      </section>
      ${
        complete
          ? ""
          : `<section class="entry-panel">
              <div class="turn-label">
                <span class="player-dot" style="--player-color:${player.color}"></span>
                <div><strong>${escapeHtml(player.name)}’s turn</strong><p>${turnDescription(player)}</p></div>
              </div>
              <div class="keypad" aria-label="Pins knocked down">
                ${Array.from({ length: 11 }, (_, pins) => `
                  <button class="pin-button ${pins > turn.maxPins ? "disabled" : ""}" data-pins="${pins}" ${pins > turn.maxPins ? "disabled" : ""}>${pins === 10 ? "X" : pins}</button>
                `).join("")}
                <button class="undo-button" id="undo" ${state.rollHistory.length || state.players.some((item) => item.frames.some((frame) => frame.length)) ? "" : "disabled"}>Correct last roll</button>
                ${canDeferTurn ? `<button class="undo-button" id="defer-turn">Move to end of frame</button>` : ""}
              </div>
            </section>`
      }
      ${complete ? finalRankings(state.players) : ""}
      <section class="scorecards">
        ${orderedPlayers.map((item) => scorecard(item, item.id === player.id)).join("")}
      </section>
      ${complete ? "" : liveStandings(state.players)}
      ${
        complete
          ? `<section class="complete-card">
              <span class="complete-icon">★</span>
              <div><strong>Scorecards saved</strong><p>Share the results, then start the next game.</p></div>
              <button class="primary-button compact" data-new-game>New game</button>
            </section>
            ${gameSummary(state.players)}`
          : ""
      }
    </main>`;

  document.querySelector("#share").addEventListener("click", shareGame);
  document.querySelector("#view-history").addEventListener("click", () => renderHistory(true));
  document.querySelector("#view-rules").addEventListener("click", () => renderRules(true));
  document.querySelectorAll("[data-new-game]").forEach((button) => {
    button.addEventListener("click", resetGame);
  });
  document.querySelector("#undo")?.addEventListener("click", undoRoll);
  document.querySelector("#defer-turn")?.addEventListener("click", deferActiveTurn);
  document.querySelectorAll("[data-pins]").forEach((button) => {
    button.addEventListener("click", () => addRoll(Number(button.dataset.pins)));
  });
}

async function shareGame() {
  const lines = state.players.map((player) => `${player.name}: ${scoreText(player)}`);
  const gameName = state.title ? ` · ${state.title}` : "";
  const text = `Duckpin scoreboard${gameName}\n${lines.join("\n")}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Duckpin scoreboard", text });
      shareFeedback = { type: "success", message: "Scorecard shared." };
      renderGame();
      return;
    }
    if (!navigator.clipboard?.writeText) {
      throw new Error("This browser does not support sharing or copying from the app.");
    }
    await navigator.clipboard.writeText(text);
    shareFeedback = { type: "success", message: "Scorecard copied to your clipboard." };
    renderGame();
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Could not share the scoreboard.", error);
    shareFeedback = {
      type: "error",
      message: "Could not share scores. Check your browser permissions and try again."
    };
    renderGame();
  }
}

function render() {
  if (state?.players?.length) renderGame();
  else renderSetup();
}

if ("serviceWorker" in navigator) {
  let reloadingForWorkerUpdate = false;
  window.addEventListener("load", () => {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForWorkerUpdate) return;
      reloadingForWorkerUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("./sw.js?v=21", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn("Offline support could not be enabled.", error);
      });
  });
}

applyTheme();
colorSchemeMedia?.addEventListener?.("change", () => {
  if (settings.theme === "system") applyTheme();
});
render();
