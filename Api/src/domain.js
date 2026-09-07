import { z } from 'zod';
export function today(timeZone = 'Europe/London') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const inspectionInput = z.object({
  inspectorName: z.string().trim().min(1).max(100),
  performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baselineId: z.string().nullable(),
  readings: z.array(z.object({ outletId: z.string(), current: z.number().int().min(0).max(2147483647) })).min(1)
});
export function validateReadings(readings, outlets, previous) {
  if (!readings.length || new Set(readings.map(r => r.outletId)).size !== readings.length || readings.some(r => !outlets.some(o => o.id === r.outletId))) return 'Enter at least one reading, with no duplicate or unknown outlets.';
  if (readings.some(r => previous[r.outletId] !== undefined && r.current < previous[r.outletId])) return 'A counter cannot be lower than its previous reading. Check the entry; a replaced or reset counter needs administrator review.';
  return null;
}
