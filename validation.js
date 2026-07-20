/**
 * validation.js — Frontend input sanitization & validation helpers
 *
 * SAFE: additive only. These functions never modify stored data.
 * Usage: import { sanitizeInput, validateGroupName, ... } from './validation.js'
 * Rollback: remove the import line in F1League.jsx — zero data impact.
 */

const VALID_DRIVERS = [
  "Lando Norris", "Oscar Piastri", "George Russell", "Kimi Antonelli",
  "Charles Leclerc", "Lewis Hamilton", "Max Verstappen", "Isack Hadjar",
  "Carlos Sainz", "Alexander Albon", "Fernando Alonso", "Lance Stroll",
  "Pierre Gasly", "Franco Colapinto", "Oliver Bearman", "Esteban Ocon",
  "Liam Lawson", "Arvid Lindblad", "Nico Hulkenberg", "Gabriel Bortoleto",
  "Sergio Perez", "Valtteri Bottas",
];

// Strip HTML tags and potentially dangerous characters.
// Returns empty string for non-string input.
export function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')       // Remove HTML tags
    .replace(/[<>&"'`]/g, '')      // Remove XSS chars
    .trim()
    .slice(0, 500);                // Hard length cap
}

// League/group name: 2–60 characters after sanitization
export function validateGroupName(name) {
  const value = sanitizeInput(name);
  if (value.length < 2) return { valid: false, error: 'Name must be at least 2 characters' };
  if (value.length > 60) return { valid: false, error: 'Name must be 60 characters or less' };
  return { valid: true, value };
}

// Nickname: 1–20 characters after sanitization
export function validateNickname(name) {
  const value = sanitizeInput(name);
  if (value.length < 1) return { valid: false, error: 'Nickname cannot be empty' };
  if (value.length > 20) return { valid: false, error: 'Nickname must be 20 characters or less' };
  return { valid: true, value };
}

// Prediction field: must be a known 2026 driver name (or empty — allowed)
export function validateDriverName(driverName) {
  if (!driverName) return { valid: true, value: '' };
  if (!VALID_DRIVERS.includes(driverName)) {
    return { valid: false, error: `Unknown driver: ${driverName}` };
  }
  return { valid: true, value: driverName };
}

// Invite code: exactly 8 uppercase alphanumeric characters
export function validateInviteCode(code) {
  if (typeof code !== 'string') return { valid: false, error: 'Invalid code' };
  const value = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(value)) {
    return { valid: false, error: 'Invite code must be 8 alphanumeric characters' };
  }
  return { valid: true, value };
}

// Validate all prediction fields for a round before submitting
// Returns { valid: true } or { valid: false, errors: string[] }
export function validatePredictions(preds, isSprint) {
  const errors = [];

  // Duplicate check: race podium P1/P2/P3 must all be different drivers
  const racePodium = [preds.raceP1, preds.raceP2, preds.raceP3].filter(Boolean);
  if (new Set(racePodium).size !== racePodium.length) {
    errors.push('Duplicate drivers in race podium (P1/P2/P3 must be different)');
  }

  // Duplicate check: sprint podium
  if (isSprint) {
    const sprintPodium = [preds.sprintP1, preds.sprintP2, preds.sprintP3].filter(Boolean);
    if (new Set(sprintPodium).size !== sprintPodium.length) {
      errors.push('Duplicate drivers in sprint podium (must be different)');
    }
  }

  // Validate each field is a known driver
  const fields = ['pole', 'raceP1', 'raceP2', 'raceP3', 'finisherPosition'];
  if (isSprint) fields.push('sprintQualPole', 'sprintP1', 'sprintP2', 'sprintP3');

  for (const field of fields) {
    if (preds[field]) {
      const result = validateDriverName(preds[field]);
      if (!result.valid) errors.push(`${field}: ${result.error}`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
