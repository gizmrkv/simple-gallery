export interface HudCallbacks {
  onCountChange: (n: number) => void;
  onSpeedChange: (v: number) => void;
  onPauseToggle: () => void;
  onReset: () => void;
  onBruteForceChange: (enabled: boolean) => void;
  onGravityChange: (enabled: boolean) => void;
}

export interface Stats {
  fps: number;
  circles: number;
  contacts: number;
  pairTests: number;
  collideMs: number;
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/** Wires up the floating control panel and exposes its live checkbox state. */
export class Hud {
  private circlesInput: HTMLInputElement;
  private circlesValue: HTMLElement;
  private speedInput: HTMLInputElement;
  private speedValue: HTMLElement;
  private pauseButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private showGridInput: HTMLInputElement;
  private bruteForceInput: HTMLInputElement;
  private gravityInput: HTMLInputElement;
  private statsEl: HTMLElement;

  constructor(callbacks: HudCallbacks) {
    this.circlesInput = getEl<HTMLInputElement>("circles");
    this.circlesValue = getEl("circlesValue");
    this.speedInput = getEl<HTMLInputElement>("speed");
    this.speedValue = getEl("speedValue");
    this.pauseButton = getEl<HTMLButtonElement>("pauseButton");
    this.resetButton = getEl<HTMLButtonElement>("resetButton");
    this.showGridInput = getEl<HTMLInputElement>("showGrid");
    this.bruteForceInput = getEl<HTMLInputElement>("bruteForce");
    this.gravityInput = getEl<HTMLInputElement>("gravity");
    this.statsEl = getEl("stats");

    this.circlesInput.addEventListener("input", () => {
      const n = Number(this.circlesInput.value);
      this.circlesValue.textContent = String(n);
      callbacks.onCountChange(n);
    });

    this.speedInput.addEventListener("input", () => {
      const v = Number(this.speedInput.value);
      this.speedValue.textContent = String(v);
      callbacks.onSpeedChange(v);
    });

    this.pauseButton.addEventListener("click", () => callbacks.onPauseToggle());
    this.resetButton.addEventListener("click", () => callbacks.onReset());

    this.bruteForceInput.addEventListener("change", () => {
      callbacks.onBruteForceChange(this.bruteForceInput.checked);
    });

    this.gravityInput.addEventListener("change", () => {
      callbacks.onGravityChange(this.gravityInput.checked);
    });
  }

  get circleCount(): number {
    return Number(this.circlesInput.value);
  }

  get showGrid(): boolean {
    return this.showGridInput.checked;
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? "Resume" : "Pause";
    this.pauseButton.classList.toggle("active", paused);
  }

  updateStats(stats: Stats): void {
    this.statsEl.innerHTML =
      `FPS: ${stats.fps}` +
      `<br>Circles: ${stats.circles}` +
      `<br>Contacts: ${stats.contacts}` +
      `<br>Pair tests: ${stats.pairTests}` +
      `<br>Collide: ${stats.collideMs.toFixed(2)} ms`;
  }
}
