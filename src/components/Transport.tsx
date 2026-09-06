import { formatTime } from '../lib/time'

const RATES = [0.25, 0.5, 0.75, 1, 1.25]

type TransportProps = {
  playing: boolean
  ready: boolean
  currentTime: number
  duration: number
  playbackRate: number
  hasDraft: boolean
  presenting: boolean
  onToggle: () => void
  onSeek: (delta: number) => void
  onRate: (rate: number) => void
  onMarkIn: () => void
  onMarkOut: () => void
  onCancelIn: () => void
  onSetPause: () => void
}

export function Transport({
  playing,
  ready,
  currentTime,
  duration,
  playbackRate,
  hasDraft,
  presenting,
  onToggle,
  onSeek,
  onRate,
  onMarkIn,
  onMarkOut,
  onCancelIn,
  onSetPause,
}: TransportProps) {
  return (
    <div className="transport">
      <div className="transport-left">
        <button type="button" className="icon-btn" disabled={!ready || presenting} onClick={() => onSeek(-2)}>
          −2s
        </button>
        <button type="button" className="play-btn" disabled={!ready || presenting} onClick={onToggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="icon-btn" disabled={!ready || presenting} onClick={() => onSeek(2)}>
          +2s
        </button>
        <span className="clock">
          {formatTime(currentTime)}
          <em> / {formatTime(duration)}</em>
        </span>
      </div>

      <div className="marker-actions">
        <button type="button" className="in-btn" disabled={!ready || presenting} onClick={onMarkIn}>
          IN
        </button>
        <button type="button" className="pause-btn" disabled={!ready || presenting} onClick={onSetPause}>
          Teach pause
        </button>
        <button type="button" className="out-btn" disabled={!ready || presenting} onClick={onMarkOut}>
          OUT
        </button>
        {hasDraft ? (
          <button type="button" className="ghost" onClick={onCancelIn}>
            Cancel IN
          </button>
        ) : null}
      </div>

      <div className="rates">
        {RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            className={playbackRate === rate ? 'is-active' : ''}
            disabled={!ready}
            onClick={() => onRate(rate)}
          >
            {rate === 1 ? '1x' : `${rate}x`}
          </button>
        ))}
      </div>
    </div>
  )
}
