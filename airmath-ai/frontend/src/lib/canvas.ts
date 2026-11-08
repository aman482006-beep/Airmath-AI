import type { Point, Stroke } from "../types/airmath";

export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function interpolatePoints(points: Point[], maxGap: number): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxGap) {
      const steps = Math.ceil(dist / maxGap);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({
          x: prev.x + dx * t,
          y: prev.y + dy * t,
          t: prev.t + (curr.t - prev.t) * t,
          pressure: prev.pressure + (curr.pressure - prev.pressure) * t,
        });
      }
    }
    result.push(curr);
  }
  return result;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const raw = stroke.points;
  if (raw.length < 2) return;
  const points = stroke.mode === "erase" ? raw : interpolatePoints(raw, 8);
  ctx.save();
  ctx.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const midpoint = {
      x: (points[index].x + points[index + 1].x) / 2,
      y: (points[index].y + points[index + 1].y) / 2,
    };
    ctx.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

export function redraw(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  strokes.forEach((stroke) => drawStroke(ctx, stroke));
}

/**
 * Adaptive thresholding using Otsu's method to binarize the image.
 */
function applyOtsuThreshold(data: Uint8ClampedArray): number {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum]++;
  }

  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * Apply 3×3 median filter to reduce salt-and-pepper noise.
 */
function medianFilter3x3(data: Uint8ClampedArray, width: number, height: number) {
  const copy = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const neighbors: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          neighbors.push(copy[idx]);
        }
      }
      neighbors.sort((a, b) => a - b);
      const median = neighbors[4];
      const outIdx = (y * width + x) * 4;
      data[outIdx] = median;
      data[outIdx + 1] = median;
      data[outIdx + 2] = median;
    }
  }
}

/**
 * Crop whitespace around the strokes to give Tesseract a tighter bounding box.
 */
function autoCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < 200) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return { data, width, height };
  }

  // Generous padding so Tesseract sees clear word boundaries
  const pad = 30;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((minY + y) * width + (minX + x)) * 4;
      const dstIdx = (y * cropW + x) * 4;
      cropped[dstIdx] = data[srcIdx];
      cropped[dstIdx + 1] = data[srcIdx + 1];
      cropped[dstIdx + 2] = data[srcIdx + 2];
      cropped[dstIdx + 3] = 255;
    }
  }

  return { data: cropped, width: cropW, height: cropH };
}

/**
 * Enhance contrast by stretching the histogram to fill the full 0-255 range.
 */
function stretchContrast(data: Uint8ClampedArray) {
  let min = 255,
    max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  if (max <= min) return;
  const range = max - min;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = Math.round(((data[i] - min) / range) * 255);
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
}

/**
 * Apply morphological dilation to thicken strokes.
 * Uses a 3×3 cross kernel. Multiple passes = thicker strokes.
 */
function dilate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  iterations: number,
) {
  for (let iter = 0; iter < iterations; iter++) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        if (copy[idx] < 200) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            data[nIdx] = 0;
            data[nIdx + 1] = 0;
            data[nIdx + 2] = 0;
          }
        }
      }
    }
  }
}

/**
 * Export strokes onto a temporary canvas with aggressive preprocessing for OCR.
 *
 * Key improvements for handwritten input:
 *  - 4× resolution scale for larger, clearer characters
 *  - Minimum stroke width of 6px so thin finger strokes become bold
 *  - 3 passes of dilation to thicken strokes to printed-text weight
 *  - Generous auto-crop padding for clear whitespace boundaries
 */
export function exportForOcr(canvas: HTMLCanvasElement, strokes: Stroke[], _background: string): string {
  const scale = 2;
  const srcW = canvas.clientWidth;
  const srcH = canvas.clientHeight;
  const tmp = document.createElement("canvas");
  tmp.width = Math.floor(srcW * scale);
  tmp.height = Math.floor(srcH * scale);
  const ctx = tmp.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");

  // Pure white background
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, srcW, srcH);

  // Draw black ink strokes with readable width
  for (const stroke of strokes) {
    if (stroke.mode === "erase") continue;
    const ocrStroke: Stroke = {
      ...stroke,
      color: "#000000",
      width: Math.max(stroke.width, 5),
    };
    drawStroke(ctx, ocrStroke);
  }

  // Get pixel data for auto-cropping
  const imageData = ctx.getImageData(0, 0, tmp.width, tmp.height);
  const data = imageData.data;

  // Auto-crop whitespace around drawing
  const cropped = autoCrop(data, tmp.width, tmp.height);

  // Preprocessing pipeline for better OCR accuracy
  // 1. Stretch contrast to maximize black/white distinction
  stretchContrast(cropped.data);
  // 2. Apply median filter to reduce noise
  medianFilter3x3(cropped.data, cropped.width, cropped.height);
  // 3. Dilate to thicken thin strokes for better recognition
  dilate(cropped.data, cropped.width, cropped.height, 2);

  // Write cropped result to a new output canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = cropped.width;
  outCanvas.height = cropped.height;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return canvas.toDataURL("image/png");

  const outData = outCtx.createImageData(cropped.width, cropped.height);
  outData.data.set(cropped.data);
  outCtx.putImageData(outData, 0, 0);

  return outCanvas.toDataURL("image/png");
}

export function point(x: number, y: number): Point {
  return { x, y, t: performance.now(), pressure: 1 };
}
