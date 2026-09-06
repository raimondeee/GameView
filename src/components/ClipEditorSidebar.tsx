import { formatTime } from '../lib/time'
import { nearestPauseIndex, PAUSE_SNAP } from '../lib/playlist'

type ClipEditorSidebarProps = {
  inTime: number
  pauseTimes: number[]
  outTime?: number
  currentTime: number
  onSeek: (time: number) => void
  onRemovePause: (time: number) => void
  onCancel: () => void
  cancelLabel?: string
}

function isAt(time: number, currentTime: number): boolean {
  return Math.abs(currentTime - time) <= PAUSE_SNAP
}

export function ClipEditorSidebar({
  inTime,
  pauseTimes,
  outTime,
  currentTime,
  onSeek,
  onRemovePause,
  onCancel,
  cancelLabel = 'Cancel IN',
}: ClipEditorSidebarProps) {
  const activePause = nearestPauseIndex(pauseTimes, currentTime)

  return (
    <aside className="sidebar clip-editor">
      <div className="sidebar-head">
        <h2>Editing clip</h2>
        <span>{1 + pauseTimes.length + (outTime === undefined ? 0 : 1)}</span>
      </div>
      <p className="empty-clips">
        Jump to IN or a teach pause to move, redraw, or remove it. Mark OUT when the play is done.
      </p>

      <ul className="mark-list">
        <li>
          <button
            type="button"
            className={`mark-hit${isAt(inTime, currentTime) && activePause < 0 ? ' is-active' : ''}`}
            onClick={() => onSeek(inTime)}
          >
            <span className="mark-kind is-in">IN</span>
            <strong>{formatTime(inTime)}</strong>
            <em>Start of the play</em>
          </button>
        </li>
        {pauseTimes.map((time, index) => (
          <li key={`${time}-${index}`}>
            <button
              type="button"
              className={`mark-hit${activePause === index ? ' is-active' : ''}`}
              onClick={() => onSeek(time)}
            >
              <span className="mark-kind is-pause">P{index + 1}</span>
              <strong>{formatTime(time)}</strong>
              <em>Teach pause</em>
            </button>
            <button type="button" className="ghost mark-remove" onClick={() => onRemovePause(time)}>
              Remove
            </button>
          </li>
        ))}
        {outTime !== undefined ? (
          <li>
            <button
              type="button"
              className={`mark-hit${isAt(outTime, currentTime) && activePause < 0 && !isAt(inTime, currentTime) ? ' is-active' : ''}`}
              onClick={() => onSeek(outTime)}
            >
              <span className="mark-kind is-out">OUT</span>
              <strong>{formatTime(outTime)}</strong>
              <em>End of the play</em>
            </button>
          </li>
        ) : (
          <li className="mark-pending">
            <span className="mark-kind is-out">OUT</span>
            <em>Not set yet — press O when the play ends</em>
          </li>
        )}
      </ul>

      {pauseTimes.length === 0 ? (
        <p className="empty-clips">No teach pauses yet. Press P or Add pause at each freeze.</p>
      ) : null}

      <div className="playlist-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </aside>
  )
}
