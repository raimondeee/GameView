import { playHeading, playNumber, playSubhead } from '../lib/playlist'
import type { Clip, PresentPhase } from '../types'

type PresentOverlayProps = {
  phase: PresentPhase
  clip: Clip | null
  clipIndex: number
  pauseIndex?: number
  pauseCount?: number
  total: number
  holdMs: number
  holdTotal: number
  onSkip: () => void
  onReady: () => void
  onExit: () => void
}

function holdLabel(holdMs: number): string {
  if (holdMs <= 350) return 'Go'
  return String(Math.max(1, Math.ceil(holdMs / 1000)))
}

export function PresentOverlay({
  phase,
  clip,
  clipIndex,
  pauseIndex = 0,
  pauseCount = 1,
  total,
  holdMs,
  holdTotal,
  onSkip,
  onReady,
  onExit,
}: PresentOverlayProps) {
  if (phase === 'off' || phase === 'drawing') return null

  if (phase === 'firstLook' || phase === 'toPause' || phase === 'finish') {
    return (
      <div className="present-chip">
        {phase === 'firstLook'
          ? 'First look · live speed · no mark-up'
          : phase === 'toPause'
            ? pauseCount > 1
              ? `Replay · teach pause ${pauseIndex + 1} of ${pauseCount}`
              : 'Replay · pausing for coach mark-up'
            : 'Play out'}
        <span>
          {playNumber(clipIndex)} · {clipIndex + 1}/{total}
        </span>
      </div>
    )
  }

  const waitingForCoach = phase === 'resetReady'
  const isReset = phase === 'reset' || waitingForCoach
  const heading = phase === 'complete' ? 'Review complete' : isReset ? 'Watch it again' : clip ? playHeading(clipIndex) : 'Play'
  const sub =
    phase === 'complete'
      ? `${total} play${total === 1 ? '' : 's'} from this game`
      : isReset
        ? 'Same clip. This time it pauses for coach mark-up.'
        : clip
          ? playSubhead(clip)
          : ''
  const detail =
    phase === 'complete'
      ? null
      : waitingForCoach
        ? pauseCount > 1
          ? `Hit Space when you are ready. Coaching view plays the same clip with ${pauseCount} teach pauses.`
          : 'Hit Space when you are ready. The coaching view starts after a 5 second count.'
        : isReset
          ? 'Players just saw the play at full speed. Space skips the rest of the count.'
          : 'Full play first, live speed, no drawings. Space starts it now, or wait for the count.'
  const progress = holdTotal > 0 ? Math.min(1, 1 - holdMs / holdTotal) : 0

  return (
    <div className={`present-overlay${isReset ? ' is-reset' : ''}${phase === 'complete' ? ' is-complete' : ''}`}>
      <p className="eyebrow">
        {phase === 'complete' ? 'GameView' : isReset ? 'Breakdown coming up' : 'First look coming up'}
      </p>
      <h2>{heading}</h2>
      {sub ? <p className="present-sub">{sub}</p> : null}
      {detail ? <p className="present-detail">{detail}</p> : null}
      {phase === 'announce' || phase === 'reset' ? (
        <div className="hold-stack" aria-live="polite">
          <strong className="hold-count">{holdLabel(holdMs)}</strong>
          <div className="hold-meter" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <em>Starting in {holdLabel(holdMs) === 'Go' ? 'now' : `${holdLabel(holdMs)}s`}</em>
        </div>
      ) : null}
      <div className="present-actions">
        {phase === 'complete' ? (
          <button type="button" className="play-btn" onClick={onExit}>
            Back to bench · Space
          </button>
        ) : waitingForCoach ? (
          <button type="button" className="play-btn" onClick={onReady}>
            Play · Space
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onSkip}>
            Skip wait · Space
          </button>
        )}
      </div>
    </div>
  )
}

type PresentDrawBarProps = {
  stepIndex: number
  stepCount: number
  pauseIndex?: number
  pauseCount?: number
  onBack: () => void
  onNext: () => void
  onContinue: () => void
}

export function PresentDrawBar({
  stepIndex,
  stepCount,
  pauseIndex = 0,
  pauseCount = 1,
  onBack,
  onNext,
  onContinue,
}: PresentDrawBarProps) {
  const last = stepIndex >= stepCount - 1
  const many = stepCount > 1
  const lastPause = pauseIndex >= pauseCount - 1
  const continueLabel = lastPause ? 'Continue play' : 'Next pause'

  return (
    <div className="present-drawbar">
      <div>
        <p className="eyebrow">
          {pauseCount > 1 ? `Coach mark-up · pause ${pauseIndex + 1} of ${pauseCount}` : 'Coach mark-up'}
        </p>
        <strong>
          {many
            ? `Step ${stepIndex + 1} of ${stepCount} · Space for the next step`
            : lastPause
              ? 'Draw on the video, then Space to continue the play.'
              : 'Draw on the video, then Space to play to the next teach pause.'}
        </strong>
      </div>
      <div className="present-drawbar-actions">
        {many ? (
          <>
            <button type="button" className="ghost" disabled={stepIndex <= 0} onClick={onBack}>
              Back
            </button>
            {last ? (
              <button type="button" className="play-btn" onClick={onContinue}>
                {continueLabel}
              </button>
            ) : (
              <button type="button" className="play-btn" onClick={onNext}>
                Next step
              </button>
            )}
          </>
        ) : (
          <button type="button" className="play-btn" onClick={onContinue}>
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  )
}
