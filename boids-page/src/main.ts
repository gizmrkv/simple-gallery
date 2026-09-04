import './style.css';
import Flock from './flock.ts';
import Vector2D from './vector2d.ts';

const canvas = document.getElementById('boidsCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

const flock = new Flock();

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

let mousePos: Vector2D | null = null;

window.addEventListener('mousemove', (e) => {
  mousePos = new Vector2D(e.clientX, e.clientY);
});

window.addEventListener('mouseout', () => {
  mousePos = null;
});

// UI elements connection
const separationSlider = document.getElementById('separation') as HTMLInputElement;
const alignmentSlider = document.getElementById('alignment') as HTMLInputElement;
const cohesionSlider = document.getElementById('cohesion') as HTMLInputElement;
const radiusSlider = document.getElementById('radius') as HTMLInputElement;
const speedSlider = document.getElementById('speed') as HTMLInputElement;
const forceSlider = document.getElementById('force') as HTMLInputElement;
const countSlider = document.getElementById('count') as HTMLInputElement;

const updateParams = () => {
  flock.params.separationWeight = parseFloat(separationSlider.value);
  flock.params.alignmentWeight = parseFloat(alignmentSlider.value);
  flock.params.cohesionWeight = parseFloat(cohesionSlider.value);
  flock.params.perceptionRadius = parseFloat(radiusSlider.value);
  flock.params.maxSpeed = parseFloat(speedSlider.value);
  flock.params.maxForce = parseFloat(forceSlider.value);
  
  const targetCount = parseInt(countSlider.value);
  flock.setCount(targetCount, width, height);
};

// Initial setup
updateParams();

[separationSlider, alignmentSlider, cohesionSlider, radiusSlider, speedSlider, forceSlider, countSlider].forEach(slider => {
  slider.addEventListener('input', updateParams);
});

// Click to add more boids
window.addEventListener('click', (e) => {
  // Ignore clicks on UI
  if ((e.target as HTMLElement).closest('.ui-container')) return;
  
  flock.addBoid(e.clientX, e.clientY);
  flock.addBoid(e.clientX + Math.random() * 10, e.clientY + Math.random() * 10);
  flock.addBoid(e.clientX - Math.random() * 10, e.clientY - Math.random() * 10);
  
  // Update slider to match new count
  countSlider.value = flock.boids.length.toString();
  const countDisplay = countSlider.parentElement?.querySelector('.value-display');
  if (countDisplay) {
    countDisplay.textContent = countSlider.value;
  }
});

function animate() {
  if (!ctx) return;
  // Fade effect for trails
  ctx.fillStyle = 'rgba(10, 10, 15, 0.2)';
  ctx.fillRect(0, 0, width, height);

  flock.update(width, height, mousePos);
  flock.draw(ctx);
  
  requestAnimationFrame(animate);
}

animate();
