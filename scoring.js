/**
 * scoring.js — canonical scoring engine for F1 Karvaan
 *
 * Imported by F1League.jsx: calculateAndSaveScores(), recalculatePoints()
 * Single source of truth — fix scoring logic here and it applies everywhere.
 *
 * Scoring rules:
 *   Pole, Race P1/P2/P3, Sprint fields: +1 for exact match
 *   R# bonus: +2 for exact finish position, +1 for closest among all players, +0 otherwise
 *
 * NOTE: F1_GRID_ORDER fallback intentionally removed.
 * If rPredFinishPositions is not set for a player (admin skipped the step),
 * they receive 0 points for R# — a safe default, never a wrong approximation.
 */

const exact = (pred, result) => (pred && result && pred === result ? 1 : 0);

/**
 * Score exact-match fields for one player's prediction.
 * R# bonus is NOT included — compute separately with rfDistance() + rfPoints().
 *
 * @param {object} roundData  - Player's prediction data for the round
 * @param {object} results    - Admin-entered race results
 * @param {boolean} isSprint  - Whether this is a sprint weekend
 * @returns {{ totalPoints: number, breakdown: object }}
 */
export function scoreRace(roundData, results, isSprint) {
  let totalPoints = 0;
  const breakdown = {};

  breakdown.pole = exact(roundData.pole, results.pole);
  totalPoints += breakdown.pole;

  if (isSprint) {
    breakdown.sprintQualPole = exact(roundData.sprintQualPole, results.sprintQualPole);
    totalPoints += breakdown.sprintQualPole;
    breakdown.sprintP1 = exact(roundData.sprintP1, results.sprintP1);
    totalPoints += breakdown.sprintP1;
    breakdown.sprintP2 = exact(roundData.sprintP2, results.sprintP2);
    totalPoints += breakdown.sprintP2;
    breakdown.sprintP3 = exact(roundData.sprintP3, results.sprintP3);
    totalPoints += breakdown.sprintP3;
  }

  breakdown.raceP1 = exact(roundData.raceP1, results.raceP1);
  totalPoints += breakdown.raceP1;
  breakdown.raceP2 = exact(roundData.raceP2, results.raceP2);
  totalPoints += breakdown.raceP2;
  breakdown.raceP3 = exact(roundData.raceP3, results.raceP3);
  totalPoints += breakdown.raceP3;

  return { totalPoints, breakdown };
}

/**
 * Compute one player's R# (random slot) position distance.
 * Returns Infinity when data is missing → rfPoints() returns 0 safely.
 *
 * DNF handling: in F1, a retired car still gets an official classified finishing
 * position if it completed ≥90% of the race distance (e.g. "Retired, Classified P14").
 * The admin enters THAT position directly — it is scored normally against R#, exactly
 * like any other finisher. Only genuine non-finishes with no official position
 * (DNS = did not start, NC = not classified — completed <90% of race distance)
 * fall back to Infinity (0 pts). This closes the "DNF = free pass to 0" loophole
 * where a driver retiring right at the R# target used to score the same as one
 * that crashed on lap 1.
 *
 * @param {string} userId
 * @param {string|null} predicted       - Player's finisherPosition prediction
 * @param {object} rPredFinishPositions - Map of { userId: "P9" | "DNS" | "NC" }
 * @param {number|null} randomNumber    - The generated random slot number
 * @returns {number} distance (0 = exact, Infinity = no data/safe zero)
 */
export function rfDistance(userId, predicted, rPredFinishPositions, randomNumber) {
  if (!randomNumber || !predicted) return Infinity;
  const posStr = rPredFinishPositions?.[userId];
  if (!posStr || posStr === 'DNS' || posStr === 'NC') return Infinity;
  const pos = parseInt(posStr.replace('P', ''), 10);
  return isNaN(pos) ? Infinity : Math.abs(pos - randomNumber);
}

/**
 * Convert a player's R# distance into bonus points.
 * Competitive: only player(s) with the minimum distance score.
 *
 * @param {number} distance     - This player's rfDistance() result
 * @param {number} minDistance  - Minimum rfDistance() across all players
 * @returns {0|1|2}
 */
export function rfPoints(distance, minDistance) {
  if (distance === Infinity || minDistance === Infinity || distance !== minDistance) return 0;
  return distance === 0 ? 2 : 1;
}
