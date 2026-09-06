export type Point = {
  x: number
  y: number
}

export type DrawTool = 'pen' | 'arrow' | 'line' | 'circle' | 'rect' | 'eraser'

export type ShapeTool = Exclude<DrawTool, 'eraser'>

export type Stroke = {
  id: string
  tool: ShapeTool
  color: string
  width: number
  points: Point[]
}

export type MarkupStep = {
  id: string
  strokes: Stroke[]
}

export type MarkupFrame = {
  id: string
  time: number
  steps: MarkupStep[]
}

export type Clip = {
  id: string
  inTime: number
  outTime: number
  pauseTime: number
  title: string
  notes: string
  markups: MarkupFrame[]
  createdAt: number
}

export type Session = {
  id: string
  videoId: string
  videoUrl: string
  title: string
  clips: Clip[]
  updatedAt: number
}

export type ReviewDraft = {
  inTime: number
  pauseTime?: number
  markups: MarkupFrame[]
}

export type PresentPhase =
  | 'off'
  | 'announce'
  | 'firstLook'
  | 'reset'
  | 'toPause'
  | 'drawing'
  | 'finish'
  | 'complete'
