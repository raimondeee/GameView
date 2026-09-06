import type { MarkupFrame, MarkupStep, Stroke } from '../types'

type LooseMarkup = {
  id: string
  time: number
  steps?: MarkupStep[]
  strokes?: Stroke[]
}

export function emptyStep(): MarkupStep {
  return { id: crypto.randomUUID(), strokes: [] }
}

export function newMarkup(time: number, strokes: Stroke[] = []): MarkupFrame {
  return {
    id: crypto.randomUUID(),
    time,
    steps: [{ id: crypto.randomUUID(), strokes }],
  }
}

export function normalizeFrame(frame: LooseMarkup): MarkupFrame {
  if (frame.steps && frame.steps.length > 0) {
    return {
      id: frame.id,
      time: frame.time,
      steps: frame.steps.map((step) => ({
        id: step.id || crypto.randomUUID(),
        strokes: step.strokes ?? [],
      })),
    }
  }

  return {
    id: frame.id,
    time: frame.time,
    steps: [{ id: crypto.randomUUID(), strokes: frame.strokes ?? [] }],
  }
}

export function frameSteps(frame: MarkupFrame): MarkupStep[] {
  return frame.steps.length > 0 ? frame.steps : [emptyStep()]
}

export function stepStrokes(frame: MarkupFrame, index: number): Stroke[] {
  return frameSteps(frame)[index]?.strokes ?? []
}

export function backdropStrokes(frame: MarkupFrame, index: number): Stroke[] {
  return frameSteps(frame)
    .slice(0, Math.max(0, index))
    .flatMap((step) => step.strokes)
}

export function replaceStepStrokes(frame: MarkupFrame, index: number, strokes: Stroke[]): MarkupFrame {
  const steps = [...frameSteps(frame)]
  const safe = Math.min(steps.length - 1, Math.max(0, index))
  steps[safe] = { ...steps[safe], strokes }
  return { ...frame, steps }
}

export function addStep(frame: MarkupFrame): MarkupFrame {
  const steps = frameSteps(frame)
  const last = steps[steps.length - 1]
  if (last && last.strokes.length === 0) return { ...frame, steps }
  return { ...frame, steps: [...steps, emptyStep()] }
}

export function removeStep(frame: MarkupFrame, index: number): MarkupFrame {
  const steps = frameSteps(frame)
  if (steps.length <= 1) {
    return { ...frame, steps: [{ ...steps[0], strokes: [] }] }
  }
  return { ...frame, steps: steps.filter((_, item) => item !== index) }
}
