// Photo transcription. Uncertain and cropped cells are explicitly annotated.
const levels = {
  2: [null, '2007', '2018'], 6: ['6024', '6050', '6072'],
  7: ['7024', '6050', '7072'], 8: ['8024', '8050', '8072'],
  9: ['9024', '9050', '9072'], 10: ['10024', '10050', '10072'],
  11: ['11024', '11050', '11072'], 12: ['12024', '12050', '12072'],
  13: ['13024', '13050', '13072'], 14: [null, null, null],
  15: [null, null, null], 16: [null, null, null],
  17: [null, null, null], 18: [null, null, null]
};
export const outlets = Object.entries(levels).flatMap(([level, rooms]) => rooms.map((room, index) => ({
  id: `level-${level}-station-${index + 1}`, level: Number(level),
  location: `Level ${level.padStart(2, '0')}${room ? ` – ${room}` : ''}`,
  label: `Bottle Refill Station ${index + 1}`,
  note: null
}))).map((outlet, sortOrder) => ({ ...outlet, sortOrder }));
