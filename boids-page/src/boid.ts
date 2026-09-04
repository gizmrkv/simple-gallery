import Vector2D from './vector2d.ts';

export interface BoidParams {
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  maxSpeed: number;
  maxForce: number;
  perceptionRadius: number;
}

export default class Boid {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  history: Vector2D[];
  historyLength: number;
  maxForce: number;
  maxSpeed: number;
  perceptionRadius: number;
  hue: number;

  constructor(x: number, y: number, id: number) {
    this.id = id;
    this.position = new Vector2D(x, y);
    this.velocity = Vector2D.random2D().setMag(Math.random() * 2 + 2);
    this.acceleration = new Vector2D();
    
    this.history = [];
    this.historyLength = 15;
    
    this.maxForce = 0.1;
    this.maxSpeed = 4;
    this.perceptionRadius = 50;
    
    this.hue = Math.random() * 60 + 200; // Base blue/cyan
  }

  edges(width: number, height: number): void {
    if (this.position.x > width + 10) this.position.x = -10;
    else if (this.position.x < -10) this.position.x = width + 10;
    
    if (this.position.y > height + 10) this.position.y = -10;
    else if (this.position.y < -10) this.position.y = height + 10;
  }

  align(boids: Boid[]): Vector2D {
    let steering = new Vector2D();
    let total = 0;
    
    for (let other of boids) {
      if (other !== this) {
        steering.add(other.velocity);
        total++;
      }
    }
    if (total > 0) {
      steering.div(total);
      steering.setMag(this.maxSpeed);
      steering.sub(this.velocity);
      steering.limit(this.maxForce);
    }
    return steering;
  }

  cohesion(boids: Boid[]): Vector2D {
    let steering = new Vector2D();
    let total = 0;
    
    for (let other of boids) {
      if (other !== this) {
        steering.add(other.position);
        total++;
      }
    }
    if (total > 0) {
      steering.div(total); // Average position
      steering.sub(this.position);
      steering.setMag(this.maxSpeed);
      steering.sub(this.velocity);
      steering.limit(this.maxForce);
    }
    return steering;
  }

  separation(boids: Boid[]): Vector2D {
    let steering = new Vector2D();
    let total = 0;
    
    for (let other of boids) {
      if (other !== this) {
        let d = this.position.dist(other.position);
        if (d < this.perceptionRadius / 2) { 
          let diff = Vector2D.sub(this.position, other.position);
          diff.div(d * d); 
          steering.add(diff);
          total++;
        }
      }
    }
    if (total > 0) {
      steering.div(total);
      steering.setMag(this.maxSpeed);
      steering.sub(this.velocity);
      steering.limit(this.maxForce);
    }
    return steering;
  }
  
  flee(targetPosition: Vector2D, radius: number): Vector2D {
    let steering = new Vector2D();
    let d = this.position.dist(targetPosition);
    if (d < radius) {
      let diff = Vector2D.sub(this.position, targetPosition);
      diff.div(d);
      steering.add(diff);
      steering.setMag(this.maxSpeed);
      steering.sub(this.velocity);
      steering.limit(this.maxForce * 2);
    }
    return steering;
  }

  flock(boids: Boid[], mousePos: Vector2D | null, params: BoidParams): void {
    this.maxForce = params.maxForce;
    this.maxSpeed = params.maxSpeed;
    this.perceptionRadius = params.perceptionRadius;
    
    let alignment = this.align(boids);
    let cohesion = this.cohesion(boids);
    let separation = this.separation(boids);
    
    alignment.mult(params.alignmentWeight);
    cohesion.mult(params.cohesionWeight);
    separation.mult(params.separationWeight);

    this.acceleration.add(alignment);
    this.acceleration.add(cohesion);
    this.acceleration.add(separation);
    
    if (mousePos) {
      let mouseFlee = this.flee(mousePos, 150);
      mouseFlee.mult(3.0);
      this.acceleration.add(mouseFlee);
    }
  }

  update(): void {
    this.position.add(this.velocity);
    this.velocity.add(this.acceleration);
    this.velocity.limit(this.maxSpeed);
    this.acceleration.mult(0);
    
    this.history.push(this.position.copy());
    if (this.history.length > this.historyLength) {
      this.history.shift();
    }
    
    let targetHue = ((this.velocity.heading() + Math.PI) / (Math.PI * 2)) * 360;
    this.hue = this.hue * 0.95 + targetHue * 0.05;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.history.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.history[0].x, this.history[0].y);
      for (let i = 1; i < this.history.length; i++) {
        if (this.history[i].dist(this.history[i-1]) > 50) {
          ctx.stroke();
          ctx.beginPath();
        }
        ctx.lineTo(this.history[i].x, this.history[i].y);
      }
      ctx.strokeStyle = `hsla(${this.hue}, 100%, 60%, 0.3)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    let angle = this.velocity.heading();
    let size = 6;
    
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(angle);
    
    ctx.beginPath();
    ctx.moveTo(size * 1.5, 0);
    ctx.lineTo(-size, size * 0.8);
    ctx.lineTo(-size * 0.6, 0);
    ctx.lineTo(-size, -size * 0.8);
    ctx.closePath();
    
    ctx.fillStyle = `hsl(${this.hue}, 100%, 70%)`;
    ctx.fill();
    
    ctx.restore();
  }
}
