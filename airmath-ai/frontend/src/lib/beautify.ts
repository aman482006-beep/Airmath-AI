import type { Point, Stroke } from "../types/airmath";

/**
 * Calculates the total length of a stroke's path.
 */
function getPathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

/**
 * Performs moving average smoothing on a list of points.
 */
function smoothPoints(points: Point[], windowSize: number = 5): Point[] {
  if (points.length <= 2) return points;
  const smoothed: Point[] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumT = 0;
    let sumPressure = 0;
    let count = 0;

    for (let w = -half; w <= half; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < points.length) {
        sumX += points[idx].x;
        sumY += points[idx].y;
        sumT += points[idx].t;
        sumPressure += points[idx].pressure;
        count++;
      }
    }

    smoothed.push({
      x: sumX / count,
      y: sumY / count,
      t: sumT / count,
      pressure: sumPressure / count,
    });
  }
  return smoothed;
}

/**
 * Snaps a straight line to the nearest horizontal or vertical axis if it is within a tolerance.
 */
function snapToAxis(start: Point, end: Point): { start: Point; end: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { start, end };

  // Angle tolerance of ~15 degrees
  const toleranceRad = 15 * (Math.PI / 180);
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx));

  const snappedStart = { ...start };
  const snappedEnd = { ...end };

  // Check if nearly horizontal (angle near 0 or PI)
  if (angle < toleranceRad) {
    const avgY = (start.y + end.y) / 2;
    snappedStart.y = avgY;
    snappedEnd.y = avgY;
  }
  // Check if nearly vertical (angle near PI/2)
  else if (Math.abs(angle - Math.PI / 2) < toleranceRad) {
    const avgX = (start.x + end.x) / 2;
    snappedStart.x = avgX;
    snappedEnd.x = avgX;
  }

  return { start: snappedStart, end: snappedEnd };
}

/**
 * Beautifies a completed drawing stroke:
 *  - Snaps tiny strokes (dots) to a single centered dot.
 *  - Snaps straight-like strokes to perfect straight lines, aligning horizontally or vertically if close.
 *  - Smooths curved/shaky lines using multiple passes of moving-average filters.
 */
export function beautifyStroke(stroke: Stroke): Stroke {
  if (stroke.mode === "erase" || stroke.points.length <= 1) {
    return stroke;
  }

  const points = stroke.points;
  const start = points[0];
  const end = points[points.length - 1];

  const pathLength = getPathLength(points);
  const directDistance = Math.hypot(end.x - start.x, end.y - start.y);

  // 1. Detect if it's a dot
  if (pathLength < 10) {
    const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return {
      ...stroke,
      points: [
        { x: avgX, y: avgY, t: start.t, pressure: start.pressure },
        { x: avgX + 0.1, y: avgY, t: end.t, pressure: end.pressure },
      ],
    };
  }

  // 2. Detect if it's a straight line (ratio of distance to path length is high)
  const straightnessRatio = directDistance / pathLength;
  if (straightnessRatio > 0.85) {
    const { start: snappedStart, end: snappedEnd } = snapToAxis(start, end);
    return {
      ...stroke,
      points: [snappedStart, snappedEnd],
    };
  }

  // 3. Otherwise, it is a curve. Smooth it to eliminate shakiness.
  // Apply 3 passes of moving average smoothing.
  let smoothed = points;
  for (let pass = 0; pass < 3; pass++) {
    smoothed = smoothPoints(smoothed, 5);
  }

  return {
    ...stroke,
    points: smoothed,
  };
}
