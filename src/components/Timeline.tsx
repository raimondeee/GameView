import { Fragment, useRef } from 'react'
import { clipPauseTimes } from '../lib/playlist'
import { clamp } from '../lib/time'
import type { Clip, ReviewDraft } from '../types'

type TimelineProps = {
  duration: number
  currentTime: number
  clips: Clip[]
  draft: ReviewDraft | null
  selectedClipId: string | null
  locked?: boolean
  onSeek: (time: number) => void
}

export function Timeline({
  duration,
  currentTime,
  clips,
  draft,
  selectedClipId,
  locked = false,
  onSeek,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null)

  const timeFromEvent = (clientX: number) => {
    const bar = barRef.current
    if (!bar || duration <= 0) return 0
    const rect = bar.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return ratio * duration
  }

  return (
    <div
      ref={barRef}
      className={`timeline${locked ? ' is-locked' : ''}`}
      role="slider"
      aria-label="Video timeline"
      aria-valuemin={0}
      aria-valuemax={Math.max(duration, 0)}
      aria-valuenow={currentTime}
      tabIndex={0}
      onPointerDown={(event) => {
        if (!locked) onSeek(timeFromEvent(event.clientX))
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 2))
        if (event.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 2))
      }}
    >
      {clips.map((clip) => {
        if (duration <= 0) return null
        const left = (clip.inTime / duration) * 100
        const width = Math.max(0.6, ((clip.outTime - clip.inTime) / duration) * 100)
        return (
          <Fragment key={clip.id}>
            <span
              className={`clip-range${selectedClipId === clip.id ? ' is-selected' : ''}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
            {clipPauseTimes(clip).map((time) => (
              <span key={`${clip.id}-${time}`} className="pause-tick" style={{ left: `${(time / duration) * 100}%` }} />
            ))}
          </Fragment>
        )
      })}
      {draft && duration > 0 ? (
        <span className="in-tick" style={{ left: `${(draft.inTime / duration) * 100}%` }} />
      ) : null}
      {draft && duration > 0
        ? draft.pauseTimes.map((time) => (
            <span key={`draft-${time}`} className="pause-tick" style={{ left: `${(time / duration) * 100}%` }} />
          ))
        : null}
      {duration > 0 ? (
        <span className="playhead" style={{ left: `${(currentTime / duration) * 100}%` }} />
      ) : null}
    </div>
  )
}
