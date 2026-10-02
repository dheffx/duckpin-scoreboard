export const FRAME_COUNT = 10;

export function createFrames() {
  return Array.from({ length: FRAME_COUNT }, () => []);
}

export function isStrike(frame) {
  return frame[0] === 10;
}

export function isSpare(frame) {
  return frame.length === 2 && frame[0] < 10 && frame[0] + frame[1] === 10;
}

export function isFrameComplete(frame, frameIndex) {
  if (!frame.length) return false;

  if (frameIndex === FRAME_COUNT - 1) {
    if (isStrike(frame)) return frame.length === 3;
    if (frame.length < 2) return false;
    if (frame[0] + frame[1] === 10) return frame.length === 3;
    return frame.length === 3;
  }

  return isStrike(frame) || frame.length === 3 || (frame.length === 2 && frame[0] + frame[1] === 10);
}

export function nextRoll(frames) {
  const frameIndex = frames.findIndex((frame, index) => !isFrameComplete(frame, index));
  if (frameIndex === -1) return null;

  const frame = frames[frameIndex];
  const isTenth = frameIndex === FRAME_COUNT - 1;
  const rollIndex = frame.length;
  let maxPins = 10;

  if (isTenth && frame[0] === 10) {
    if (rollIndex === 2 && frame[1] < 10) {
      maxPins = 10 - frame[1];
    }
  } else if (rollIndex > 0) {
    const isSpareBonus = isTenth && frame.length === 2 && frame[0] + frame[1] === 10;
    if (!isSpareBonus) maxPins = 10 - frame.reduce((total, pins) => total + pins, 0);
  }

  return { frameIndex, rollIndex, maxPins };
}

export function nextPlayerIndex(players, currentPlayerIndex) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const playerIndex = (currentPlayerIndex + offset) % players.length;
    if (!isFrameComplete(players[playerIndex].frames[FRAME_COUNT - 1], FRAME_COUNT - 1)) {
      return playerIndex;
    }
  }
  return currentPlayerIndex;
}

function followingRolls(frames, frameIndex) {
  return frames.slice(frameIndex + 1).flat();
}

export function frameScore(frames, frameIndex) {
  const frame = frames[frameIndex];
  if (!frame.length) return null;

  if (frameIndex === FRAME_COUNT - 1) {
    if (isStrike(frame)) return frame.length === 3 ? frame.reduce((total, pins) => total + pins, 0) : null;
    if (frame.length < 2) return null;
    if (frame[0] + frame[1] === 10) return frame.length === 3 ? 10 + frame[2] : null;
    return frame.length === 3 ? frame.reduce((total, pins) => total + pins, 0) : null;
  }

  if (isStrike(frame)) {
    const rolls = followingRolls(frames, frameIndex);
    return rolls.length >= 2 ? 10 + rolls[0] + rolls[1] : null;
  }

  if (frame.length >= 2 && frame[0] + frame[1] === 10) {
    const [next] = followingRolls(frames, frameIndex);
    return next === undefined ? null : 10 + next;
  }

  return frame.length === 3 ? frame.reduce((total, pins) => total + pins, 0) : null;
}

export function scoreFrames(frames) {
  let total = 0;
  return frames.map((_, frameIndex) => {
    const score = frameScore(frames, frameIndex);
    if (score !== null) total += score;
    return { score, cumulative: score === null ? null : total };
  });
}

export function gameTotal(frames) {
  const scores = scoreFrames(frames);
  return scores.at(-1)?.cumulative ?? null;
}

export function liveScore(frames) {
  const total = frames.reduce((runningTotal, frame, frameIndex) => {
    if (frameIndex === FRAME_COUNT - 1) {
      return runningTotal + frame.reduce((sum, pins) => sum + pins, 0);
    }

    if (isStrike(frame)) {
      const bonuses = followingRolls(frames, frameIndex).slice(0, 2);
      return runningTotal + 10 + bonuses.reduce((sum, pins) => sum + pins, 0);
    }

    if (frame.length >= 2 && frame[0] + frame[1] === 10) {
      const [bonus = 0] = followingRolls(frames, frameIndex);
      return runningTotal + 10 + bonus;
    }

    return runningTotal + frame.reduce((sum, pins) => sum + pins, 0);
  }, 0);

  const hasPendingBonus = frames.some((frame, frameIndex) => {
    if (frameIndex === FRAME_COUNT - 1) {
      return (
        (isStrike(frame) && frame.length < 3) ||
        (frame.length >= 2 && frame[0] + frame[1] === 10 && frame.length < 3)
      );
    }

    if (isStrike(frame)) return followingRolls(frames, frameIndex).length < 2;
    return frame.length >= 2 && frame[0] + frame[1] === 10 && followingRolls(frames, frameIndex).length < 1;
  });

  return { total, hasPendingBonus };
}

export function frameStats(frames) {
  return frames.reduce(
    (stats, frame) => ({
      strikes: stats.strikes + (isStrike(frame) ? 1 : 0),
      spares: stats.spares + (isSpare(frame) ? 1 : 0)
    }),
    { strikes: 0, spares: 0 }
  );
}

export function formatRoll(frame, rollIndex, frameIndex) {
  const pins = frame[rollIndex];
  if (pins === undefined) return "";
  if (pins === 10) return "X";
  if (
    rollIndex === 1 &&
    frame[0] < 10 &&
    frame[0] + pins === 10
  ) {
    return "/";
  }
  if (
    frameIndex === FRAME_COUNT - 1 &&
    frame[0] === 10 &&
    rollIndex === 2 &&
    frame[1] < 10 &&
    frame[1] + pins === 10
  ) {
    return "/";
  }
  return String(pins);
}
