import "./style.css";
import { Simulation } from "./simulation";
import { Hud } from "./hud";
import { render } from "./render";

const INITIAL_COUNT = 500;
const MAX_DT = 1 / 20; // clamp big deltas (tab refocus, etc.)

const canvas = getEl<HTMLCanvasElement>("scene");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context is not available");

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();

const sim = new Simulation(canvas.width, canvas.height);
sim.spawn(INITIAL_COUNT);

let currentCircleCount = INITIAL_COUNT;

const hud = new Hud({
  onCountChange: (n) => {
    currentCircleCount = n;
    sim.setCount(n);
  },
  onSpeedChange: (v) => sim.setSpeed(v),
  onPauseToggle: () => {
    sim.paused = !sim.paused;
    hud.setPaused(sim.paused);
  },
  onReset: () => sim.spawn(currentCircleCount),
  onBruteForceChange: (enabled) => {
    sim.bruteForceEnabled = enabled;
  },
  onGravityChange: (enabled) => sim.setGravity(enabled),
});

window.addEventListener("resize", () => {
  resizeCanvas();
  sim.setBounds(canvas.width, canvas.height);
});

let lastTime = performance.now();
let fps = 0;

function frame(now: number): void {
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  if (rawDt > 0) {
    const instantFps = 1 / rawDt;
    fps = fps === 0 ? instantFps : fps * 0.9 + instantFps * 0.1;
  }

  sim.step(Math.min(rawDt, MAX_DT));

  // Brute-force mode skips the grid for collision detection; rebuild it
  // separately (visualization only) when the overlay is requested.
  if (hud.showGrid && sim.bruteForceEnabled) {
    sim.buildGridForVisualization();
  }

  render(ctx!, sim, hud.showGrid);

  hud.updateStats({
    fps: Math.round(fps),
    circles: sim.count,
    contacts: sim.contactCount,
    pairTests: sim.pairTestCount,
    collideMs: sim.collideTimeMs,
  });

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}
