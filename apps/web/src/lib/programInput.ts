import { DISCIPLINES, type Discipline } from '@vela/api';

/**
 * Field checks the day and item routes share, so the limits are said once and an
 * assistant gets the same sentence whichever route refused it.
 */
export const ITEM_NOTES_MAX = 1000;
export const DAY_NOTES_MAX = 4000;
export const DAY_TITLE_MAX = 80;

export function parseDiscipline(v: unknown): Discipline | 'invalid' | undefined {
  if (v === undefined) return undefined;
  return DISCIPLINES.some((d) => d.value === v) ? (v as Discipline) : 'invalid';
}

export const DISCIPLINE_LIST = DISCIPLINES.map((d) => d.value).join(', ');

/** 1–7, where 1 is Monday. */
export function parseDayNo(v: unknown): number | 'invalid' | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 'invalid';
}

export function parseWeekNo(v: unknown): number | 'invalid' | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 52 ? n : 'invalid';
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
