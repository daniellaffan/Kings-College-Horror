// Quest definitions. Act I is a sincere, cheerful first day; Act II reuses the same quests
// and adds entries that are "written back" in second person.
import type { QuestDef } from './state';

export const QUESTS: Record<string, QuestDef> = {
  formRoom: { id: 'formRoom', title: 'First Day!', objective: 'Find Form Room 12 in the Academic Block', xp: 40, stat: ['wits', 1], target: 'formRoom' },
  library: { id: 'library', title: 'Overdue', objective: 'Return The Tempest to the library desk', xp: 35, stat: ['wits', 1], target: 'libraryDesk' },
  trials: { id: 'trials', title: 'Football Trials', objective: 'Meet Theo on the 5G pitch and take a penalty', xp: 50, stat: ['grit', 2], target: 'theo' },
  smoothie: { id: 'smoothie', title: 'Tide Café', objective: 'Grab a smoothie from the café in the dining hall', xp: 25, stat: ['charm', 1], target: 'cafeCounter' },
  friend: { id: 'friend', title: 'Make a Friend', objective: 'Hang out with Amara (talk to her 3 times)', xp: 60, stat: ['charm', 2], target: 'amara' },
  chemistry: { id: 'chemistry', title: 'Chemistry', objective: "Go to Ms. Fairweather's lesson in the Chemistry Lab", xp: 45, stat: ['wits', 2], target: 'lab1Front' },
  // Act II
  remember: { id: 'remember', title: 'Remember Amara', objective: 'Remember Amara', xp: 0 },
  pool: { id: 'pool', title: '', objective: 'Stop looking at the pool.', xp: 0 },
  breathe: { id: 'breathe', title: '', objective: 'You can stop holding your breath now.', xp: 0 },
  stay: { id: 'stay', title: '', objective: 'Stay. It is the first day. It is always the first day.', xp: 0 },
  // Act III
  lockin: { id: 'lockin', title: 'Lock-In', objective: 'Get out of the library', xp: 0, target: 'corridorBNorth' },
  pratt: { id: 'pratt', title: 'Lock-In', objective: 'Find Mr. Pratt', xp: 0, target: 'stairBottom' },
  flare: { id: 'flare', title: 'Lock-In', objective: 'Make a flare in the Chemistry Lab (magnesium, nitrate, casing)', xp: 0, target: 'lab1Centre' },
  override: { id: 'override', title: 'Lock-In', objective: 'Reach the gate override in the plant room', xp: 0, target: 'plantPanel' },
};
