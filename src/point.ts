// @ts-nocheck
/*
Simple Point class by Konrad Papała - https://github.com/kpion/geometry

Examples:

var point1 = new Point(100,42);
var point2 = new Point([10,10]);//different input, also accepted is another Point object
point1.add(1,1);//point1 is now: 101,43
point1.add(point2);//point1 is now: 111,53
var point3 = point2.clone().multiply(2);//chaining
*/
export class Point {
  // see this.set for possible x,y values
  constructor(x = 0, y = null) {
    this.set(x, y);
  }

  /*
  possible scenarios:
  point.set(42,12);
  point.set([42,12]);
  point.set(anotherPointObject);
  point.set(42);//x and y set to '42'. Useful e.g. with the this.multiply method.
  */
  set(x = null, y = null) {
    if (typeof x === 'number' || typeof x === 'string') {
      this.x = parseFloat(x);
      if (y !== null) {
        this.y = parseFloat(y);
      } else {
        this.y = x; // so, based on one value.
      }
    } else if (Array.isArray(x)) {
      const point = x;
      this.x = parseFloat(point[0]);
      this.y = parseFloat(point[1]);
    } else if (typeof x === 'object') {
      // we (Point) or any other object having x,y properties
      const point = x;
      this.x = point.x;
      this.y = point.y;
    } else {
      this.x = this.y = 0;
    }
    return this;
  }

  add(x, y) {
    const point = new Point(x, y);
    this.x += point.x;
    this.y += point.y;
    return this;
  }

  substract(x, y) {
    const point = new Point(x, y);
    this.x -= point.x;
    this.y -= point.y;
    return this;
  }

  multiply(x, y) {
    const point = new Point(x, y);
    this.x *= point.x;
    this.y *= point.y;
    return this;
  }

  scale(x, y) {
    return this.multiply(x, y);
  }

  divide(x, y) {
    const point = new Point(x, y);
    this.x /= point.x;
    this.y /= point.y;
    return this;
  }

  equals(x, y) {
    const point = new Point(x, y);
    return this.x === point.x && this.y === point.y;
  }

  clone() {
    return new Point(this);
  }

  toString() {
    return JSON.stringify(this);
  }
}
