import { useEffect, useRef, useState } from 'react'
import { hitTestStroke, renderStroke } from '../lib/drawing'
import type { DrawTool, Point, ShapeTool, Stroke } from '../types'

type DrawingCanvasProps = {
  enabled: boolean
  hidden?: boolean
  strokes: Stroke[]
  backdrop?: Stroke[]
  tool: DrawTool
  color: string
  brush: number
  onChange: (strokes: Stroke[]) => void
}

function normalize(event: PointerEvent, rect: DOMRect): Point {
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  }
}

export function DrawingCanvas({
  enabled,
  hidden = false,
  strokes,
  backdrop = [],
  tool,
  color,
  brush,
  onChange,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState<Stroke | null>(null)
  const liveRef = useRef<Stroke | null>(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    liveRef.current = live
  }, [live])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const paint = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      if (hidden) return
      for (const stroke of backdrop) renderStroke(ctx, stroke, rect.width, rect.height, 0.38)
      for (const stroke of strokes) renderStroke(ctx, stroke, rect.width, rect.height)
      if (liveRef.current) renderStroke(ctx, liveRef.current, rect.width, rect.height)
    }

    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas.parentElement ?? canvas)
    return () => observer.disconnect()
  }, [backdrop, hidden, live, strokes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled || hidden) return

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const point = normalize(event, rect)

      if (tool === 'eraser') {
        const next = strokes.filter((stroke) => !hitTestStroke(stroke, point, rect.width, rect.height))
        if (next.length !== strokes.length) onChange(next)
        return
      }

      drawingRef.current = true
      canvas.setPointerCapture(event.pointerId)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: tool as ShapeTool,
        color,
        width: brush,
        points: [point],
      }
      liveRef.current = stroke
      setLive(stroke)
    }

    const onMove = (event: PointerEvent) => {
      if (!drawingRef.current || !liveRef.current) return
      const rect = canvas.getBoundingClientRect()
      const point = normalize(event, rect)
      const current = liveRef.current
      const next: Stroke =
        current.tool === 'pen'
          ? { ...current, points: [...current.points, point] }
          : { ...current, points: [current.points[0], point] }
      liveRef.current = next
      setLive(next)
    }

    const finish = (event: PointerEvent) => {
      if (!drawingRef.current) return
      drawingRef.current = false
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // Capture may already be released.
      }
      const finished = liveRef.current
      liveRef.current = null
      setLive(null)
      if (finished && finished.points.length >= 1) {
        onChange([...strokes, finished])
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', finish)
    canvas.addEventListener('pointercancel', finish)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', finish)
      canvas.removeEventListener('pointercancel', finish)
    }
  }, [brush, color, enabled, hidden, onChange, strokes, tool])

  return (
    <canvas
      ref={canvasRef}
      className={`draw-layer${enabled ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}`}
      aria-hidden={!enabled || hidden}
    />
  )
}
