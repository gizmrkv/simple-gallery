export default class Vector2D {
  x: number;
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }
  
  add(v: Vector2D): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  
  sub(v: Vector2D): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  
  mult(n: number): this {
    this.x *= n;
    this.y *= n;
    return this;
  }
  
  div(n: number): this {
    this.x /= n;
    this.y /= n;
    return this;
  }
  
  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  
  magSq(): number {
    return this.x * this.x + this.y * this.y;
  }
  
  normalize(): this {
    let m = this.mag();
    if (m !== 0) {
      this.div(m);
    }
    return this;
  }
  
  limit(max: number): this {
    if (this.magSq() > max * max) {
      this.normalize();
      this.mult(max);
    }
    return this;
  }
  
  setMag(n: number): this {
    this.normalize();
    this.mult(n);
    return this;
  }
  
  heading(): number {
    return Math.atan2(this.y, this.x);
  }
  
  dist(v: Vector2D): number {
    let dx = this.x - v.x;
    let dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  copy(): Vector2D {
    return new Vector2D(this.x, this.y);
  }
  
  static sub(v1: Vector2D, v2: Vector2D): Vector2D {
    return new Vector2D(v1.x - v2.x, v1.y - v2.y);
  }

  static add(v1: Vector2D, v2: Vector2D): Vector2D {
    return new Vector2D(v1.x + v2.x, v1.y + v2.y);
  }

  static random2D(): Vector2D {
    let angle = Math.random() * Math.PI * 2;
    return new Vector2D(Math.cos(angle), Math.sin(angle));
  }
}
