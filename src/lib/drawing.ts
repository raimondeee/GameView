import type { Point, Stroke } from '../types'

function toPixels(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: point.y * height }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return distance(point, start)

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq))
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function arrowHead(start: Point, end: Point, size: number): Point[] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  return [
    end,
    {
      x: end.x - size * Math.cos(angle - Math.PI / 6),
      y: end.y - size * Math.sin(angle - Math.PI / 6),
    },
    {
      x: end.x - size * Math.cos(angle + Math.PI / 6),
      y: end.y - size * Math.sin(angle + Math.PI / 6),
    },
  ]
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
  alpha = 1,
): void {
  const points = stroke.points.map((point) => toPixels(point, width, height))
  if (points.length === 0) return

  const minDim = Math.min(width, height)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = Math.max(1.5, stroke.width * minDim)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.tool === 'pen') {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
  }

  if ((stroke.tool === 'line' || stroke.tool === 'arrow') && points.length >= 2) {
    const start = points[0]
    const end = points[points.length - 1]
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()

    if (stroke.tool === 'arrow') {
      const head = arrowHead(start, end, Math.max(12, ctx.lineWidth * 4))
      ctx.beginPath()
      ctx.moveTo(head[0].x, head[0].y)
      ctx.lineTo(head[1].x, head[1].y)
      ctx.lineTo(head[2].x, head[2].y)
      ctx.closePath()
      ctx.fill()
    }
  }

  if (stroke.tool === 'circle' && points.length >= 2) {
    const start = points[0]
    const end = points[points.length - 1]
    const rx = Math.abs(end.x - start.x) / 2
    const ry = Math.abs(end.y - start.y) / 2
    const cx = (start.x + end.x) / 2
    const cy = (start.y + end.y) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (stroke.tool === 'rect' && points.length >= 2) {
    const start = points[0]
    const end = points[points.length - 1]
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
  }

  ctx.restore()
}

export function hitTestStroke(stroke: Stroke, point: Point, width: number, height: number): boolean {
  const pixels = toPixels(point, width, height)
  const points = stroke.points.map((item) => toPixels(item, width, height))
  const threshold = Math.max(10, stroke.width * Math.min(width, height) * 3)

  if (stroke.tool === 'pen') {
    for (let i = 1; i < points.length; i += 1) {
      if (distanceToSegment(pixels, points[i - 1], points[i]) <= threshold) return true
    }
    return points.some((item) => distance(pixels, item) <= threshold)
  }

  if (points.length < 2) return false
  const start = points[0]
  const end = points[points.length - 1]

  if (stroke.tool === 'line' || stroke.tool === 'arrow') {
    return distanceToSegment(pixels, start, end) <= threshold
  }

  if (stroke.tool === 'rect') {
    const left = Math.min(start.x, end.x) - threshold
    const right = Math.max(start.x, end.x) + threshold
    const top = Math.min(start.y, end.y) - threshold
    const bottom = Math.max(start.y, end.y) + threshold
    return pixels.x >= left && pixels.x <= right && pixels.y >= top && pixels.y <= bottom
  }

  const rx = Math.abs(end.x - start.x) / 2 + threshold
  const ry = Math.abs(end.y - start.y) / 2 + threshold
  const cx = (start.x + end.x) / 2
  const cy = (start.y + end.y) / 2
  const nx = (pixels.x - cx) / rx
  const ny = (pixels.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

export const DRAW_COLORS = ['#ff3b30', '#ffcc00', '#0a84ff', '#34c759', '#ffffff', '#111111'] as const

export const BRUSH_SIZES = [
  { id: 'thin', label: 'Thin', value: 0.004 },
  { id: 'med', label: 'Med', value: 0.008 },
  { id: 'thick', label: 'Thick', value: 0.014 },
] as const
