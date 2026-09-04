import Boid, { BoidParams } from './boid.ts';
import Vector2D from './vector2d.ts';

export default class Flock {
  boids: Boid[];
  nextId: number;
  params: BoidParams;

  constructor() {
    this.boids = [];
    this.nextId = 0;
    
    this.params = {
      separationWeight: 1.5,
      alignmentWeight: 1.0,
      cohesionWeight: 1.0,
      maxSpeed: 4,
      maxForce: 0.1,
      perceptionRadius: 50
    };
  }

  addBoid(x: number, y: number): void {
    this.boids.push(new Boid(x, y, this.nextId++));
  }
  
  setCount(count: number, width: number, height: number): void {
    if (count > this.boids.length) {
      let addCount = count - this.boids.length;
      for (let i = 0; i < addCount; i++) {
        this.addBoid(Math.random() * width, Math.random() * height);
      }
    } else if (count < this.boids.length) {
      this.boids.splice(count);
    }
  }

  update(width: number, height: number, mousePos: Vector2D | null): void {
    let perceptionSq = this.params.perceptionRadius * this.params.perceptionRadius;
    
    for (let boid of this.boids) {
      let locals: Boid[] = [];
      for (let other of this.boids) {
        if (boid !== other) {
          let dx = boid.position.x - other.position.x;
          let dy = boid.position.y - other.position.y;
          if (dx * dx + dy * dy < perceptionSq) {
            locals.push(other);
          }
        }
      }
      
      boid.flock(locals, mousePos, this.params);
      boid.update();
      boid.edges(width, height);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let boid of this.boids) {
      boid.draw(ctx);
    }
  }
}
