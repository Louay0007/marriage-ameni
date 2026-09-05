import type { Point, Stroke } from '@marriage/shared';

export const SIGNATURE_WIDTH = 960;
export const SIGNATURE_HEIGHT = 320;

export function normalizePoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  time: number,
  pressure?: number,
): Point {
  const point: Point = {
    x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
    t: time,
  };

  if (pressure !== undefined) point.pressure = pressure;
  return point;
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
) {
  const [first, ...remaining] = stroke.points;
  if (!first) return;

  context.beginPath();
  context.moveTo(first.x * width, first.y * height);

  if (remaining.length === 0) {
    context.lineTo(first.x * width + 0.01, first.y * height + 0.01);
  } else {
    for (let index = 0; index < remaining.length - 1; index += 1) {
      const point = remaining[index];
      const next = remaining[index + 1];
      if (!point || !next) continue;
      const midpointX = ((point.x + next.x) / 2) * width;
      const midpointY = ((point.y + next.y) / 2) * height;
      context.quadraticCurveTo(
        point.x * width,
        point.y * height,
        midpointX,
        midpointY,
      );
    }

    const last = remaining.at(-1);
    if (last) context.lineTo(last.x * width, last.y * height);
  }

  context.stroke();
}

export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, width * 0.0032);
  context.strokeStyle = '#28241f';

  for (const stroke of strokes) drawStroke(context, stroke, width, height);
}

export function renderSignatureBlob(strokes: Stroke[]): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SIGNATURE_WIDTH;
  canvas.height = SIGNATURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);

  drawStrokes(context, strokes, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
