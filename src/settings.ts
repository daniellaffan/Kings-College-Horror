// Player settings. These always tell the truth: the gore level and every other option
// do exactly what they say, even while the game is lying about everything else.
import type { Quality } from './engine/renderer';

export type GoreLevel = 'off' | 'moderate' | 'extreme';

export interface Settings {
  gore: GoreLevel;
  quality: Quality;
  sensitivity: number;
  volume: number;
  reduceFlashes: boolean;
  subtitles: boolean;
  showFps: boolean;
}

const KEY = 'khc.settings.v1';
const DEFAULTS: Settings = { gore: 'extreme', quality: 'high', sensitivity: 1, volume: 0.8, reduceFlashes: false, subtitles: true, showFps: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: use defaults */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();
const listeners: ((s: Settings) => void)[] = [];

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(settings);
}

export function onSettings(fn: (s: Settings) => void) {
  listeners.push(fn);
}

/** Blood amount multiplier for the gore level. */
export function goreScale(): number {
  return settings.gore === 'off' ? 0 : settings.gore === 'moderate' ? 0.35 : 1;
}
