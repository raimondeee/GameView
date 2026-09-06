import { BRUSH_SIZES, DRAW_COLORS } from '../lib/drawing'
import type { DrawTool } from '../types'

const TOOLS: { id: DrawTool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'line', label: 'Line' },
  { id: 'circle', label: 'Circle' },
  { id: 'rect', label: 'Box' },
  { id: 'eraser', label: 'Eraser' },
]

type DrawingToolbarProps = {
  enabled: boolean
  tool: DrawTool
  color: string
  brush: number
  canUndo: boolean
  canRedo: boolean
  hint: string
  onTool: (tool: DrawTool) => void
  onColor: (color: string) => void
  onBrush: (brush: number) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function DrawingToolbar({
  enabled,
  tool,
  color,
  brush,
  canUndo,
  canRedo,
  hint,
  onTool,
  onColor,
  onBrush,
  onUndo,
  onRedo,
  onClear,
}: DrawingToolbarProps) {
  return (
    <div className="draw-tools">
      <div
        className={`draw-toolbar${enabled ? '' : ' is-disabled'}`}
        role="toolbar"
        aria-label="Drawing tools"
        aria-disabled={!enabled}
      >
        <div className="tool-group">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? 'is-active' : ''}
              disabled={!enabled}
              onClick={() => onTool(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="tool-group colors">
          {DRAW_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={`swatch${color === value ? ' is-active' : ''}`}
              style={{ background: value }}
              aria-label={`Color ${value}`}
              disabled={!enabled}
              onClick={() => onColor(value)}
            />
          ))}
        </div>

        <div className="tool-group">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              className={brush === size.value ? 'is-active' : ''}
              disabled={!enabled}
              onClick={() => onBrush(size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>

        <div className="tool-group">
          <button type="button" disabled={!enabled || !canUndo} onClick={onUndo}>
            Undo
          </button>
          <button type="button" disabled={!enabled || !canRedo} onClick={onRedo}>
            Redo
          </button>
          <button type="button" disabled={!enabled} onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      <p className="draw-hint">{hint}</p>
    </div>
  )
}
