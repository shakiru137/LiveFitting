import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a human-friendly session reference.
 * Format: LFR-XXXXXXXX (uppercase alphanumeric, 8 chars)
 * This is the reference shown to users and partners.
 */
export function generateSessionRef(): string {
  const raw = uuidv4().replace(/-/g, '').toUpperCase();
  return `LFR-${raw.slice(0, 8)}`;
}
