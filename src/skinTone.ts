// Global emoji skin-tone preference (Fitzpatrick modifiers). This is a personal
// display choice, stored per-browser in localStorage, and applied to the emojis
// in this app that actually support skin-tone variation (people + hand gestures).
// Faces, hearts, animals, and objects have no skin tone in Unicode, so they are
// left untouched.

export interface SkinTone {
  key: string;
  label: string;
  swatch: string; // A hand emoji rendered at this tone, for the picker
  mod: string; // The Fitzpatrick modifier codepoint (empty for default)
}

export const SKIN_TONES: SkinTone[] = [
  { key: "default", label: "Default", swatch: "✋", mod: "" },
  { key: "light", label: "Light", swatch: "✋🏻", mod: "🏻" },
  { key: "medium-light", label: "Medium-light", swatch: "✋🏼", mod: "🏼" },
  { key: "medium", label: "Medium", swatch: "✋🏽", mod: "🏽" },
  { key: "medium-dark", label: "Medium-dark", swatch: "✋🏾", mod: "🏾" },
  { key: "dark", label: "Dark", swatch: "✋🏿", mod: "🏿" }
];

const MODS = ["🏻", "🏼", "🏽", "🏾", "🏿"];

// The exact base emojis used across the app that accept a skin-tone modifier.
// Kept explicit (rather than guessed) so we never append a modifier to an emoji
// that would render as a stray coloured square.
const TONEABLE = new Set([
  "🧑", "👩", "👨", "🧔", "🤴", "👸", // avatars (people)
  "🙏", "👏", "🫶", "🙌", "🤞" // hand gestures used in reactions & moods
]);

// Remove any existing skin-tone modifier so an emoji can be re-toned cleanly.
export function stripTone(emoji: string): string {
  if (!emoji) return emoji;
  return MODS.reduce((s, m) => s.split(m).join(""), emoji);
}

// Apply a skin-tone modifier to an emoji, but only when that emoji supports it.
export function withTone(emoji: string, mod: string): string {
  const base = stripTone(emoji);
  if (!mod) return base;
  return TONEABLE.has(base) ? base + mod : base;
}

export function supportsTone(emoji: string): boolean {
  return TONEABLE.has(stripTone(emoji));
}

const STORAGE_KEY = "courtship_skin_tone";

export function loadSkinToneMod(): string {
  try {
    const key = localStorage.getItem(STORAGE_KEY) || "default";
    return SKIN_TONES.find((t) => t.key === key)?.mod ?? "";
  } catch {
    return "";
  }
}

export function saveSkinToneKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}
