import { z } from 'zod';

export function calendarDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function addDays(value, days) {
  const date = new Date(`${calendarDate(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarDate(date);
}

export function mondayOfWeek(value) {
  const date = new Date(`${calendarDate(value)}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDays(value, -daysSinceMonday);
}

export function databaseDate(value) {
  return new Date(`${calendarDate(value)}T00:00:00Z`);
}

export const reportUpdateInput = z
  .object({
    inspectorName: z.string().trim().min(1).max(100),
    version: z.number().int().min(0),
    action: z.enum(['save', 'submit']),
    readings: z
      .array(
        z
          .object({
            outletId: z.string().min(1),
            current: z.number().int().min(0).max(2147483647).nullable(),
            version: z.number().int().min(0),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export function reportError(status, message) {
  return Object.assign(new Error(message), { status });
}
