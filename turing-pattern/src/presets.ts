// Pearson分類によるfeed/killのプリセット。

export interface Preset {
  name: string;
  feed: number;
  kill: number;
}

export const PRESETS: Preset[] = [
  { name: "Coral", feed: 0.0545, kill: 0.062 },
  { name: "Mitosis", feed: 0.0367, kill: 0.0649 },
  { name: "Spots", feed: 0.035, kill: 0.065 },
  { name: "Maze", feed: 0.029, kill: 0.057 },
  { name: "Worms", feed: 0.058, kill: 0.065 },
  { name: "Bubbles", feed: 0.039, kill: 0.058 },
  { name: "Waves", feed: 0.014, kill: 0.045 },
  { name: "U-Skate", feed: 0.062, kill: 0.0609 },
];

export const DEFAULT_PRESET_INDEX = 0; // Coral
