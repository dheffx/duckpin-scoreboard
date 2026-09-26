import assert from "node:assert/strict";
import test from "node:test";
import {
  createFrames,
  frameStats,
  formatRoll,
  gameTotal,
  nextPlayerIndex,
  nextRoll,
  scoreFrames
} from "../src/scoring.js";

function game(...rolls) {
  const frames = createFrames();
  rolls.forEach((frame, index) => { frames[index] = frame; });
  return frames;
}

test("scores open frames", () => {
  const frames = game(...Array.from({ length: 10 }, () => [1, 1, 1]));
  assert.equal(gameTotal(frames), 30);
});

test("adds two following rolls to a strike", () => {
  const frames = game([10], [3, 4, 2], ...Array.from({ length: 8 }, () => [0, 0, 0]));
  assert.equal(gameTotal(frames), 26);
  assert.equal(scoreFrames(frames)[0].score, 17);
});

test("adds one following roll to a spare", () => {
  const frames = game([7, 3], [5, 2, 1], ...Array.from({ length: 8 }, () => [0, 0, 0]));
  assert.equal(gameTotal(frames), 23);
  assert.equal(scoreFrames(frames)[0].score, 15);
});

test("gives no bonus for a three-ball ten", () => {
  const frames = game([3, 3, 4], [2, 1, 0], ...Array.from({ length: 8 }, () => [0, 0, 0]));
  assert.equal(gameTotal(frames), 13);
});

test("uses tenth-frame balls as bonuses for a ninth-frame strike", () => {
  const frames = game(...Array.from({ length: 8 }, () => [0, 0, 0]), [10], [5, 5, 7]);
  assert.equal(scoreFrames(frames)[8].score, 20);
  assert.equal(gameTotal(frames), 37);
});

test("scores tenth-frame strike and spare bonuses", () => {
  const blanks = Array.from({ length: 9 }, () => [0, 0, 0]);
  assert.equal(gameTotal(game(...blanks, [10, 5, 4])), 19);
  assert.equal(gameTotal(game(...blanks, [7, 3, 5])), 15);
});

test("resets tenth-frame strike bonus pins only after another strike", () => {
  const afterFive = game(...Array.from({ length: 9 }, () => [0, 0, 0]), [10, 5]);
  assert.equal(nextRoll(afterFive).maxPins, 5);

  const afterStrike = game(...Array.from({ length: 9 }, () => [0, 0, 0]), [10, 10]);
  assert.equal(nextRoll(afterStrike).maxPins, 10);
  assert.equal(formatRoll([10, 5, 5], 2, 9), "/");
});

test("advances turns in player order and skips finished players", () => {
  const players = [
    { frames: createFrames() },
    { frames: createFrames() },
    { frames: createFrames() }
  ];

  assert.equal(nextPlayerIndex(players, 0), 1);
  assert.equal(nextPlayerIndex(players, 2), 0);

  players[1].frames[9] = [0, 0, 0];
  assert.equal(nextPlayerIndex(players, 0), 2);
});

test("counts strike and spare frames for game summaries", () => {
  const frames = game([10], [7, 3], [3, 3, 4], ...Array.from({ length: 7 }, () => [0, 0, 0]));
  assert.deepEqual(frameStats(frames), { strikes: 1, spares: 1 });
});
