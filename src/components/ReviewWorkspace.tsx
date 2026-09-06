import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { usePlaylistPresenter } from '../hooks/usePlaylistPresenter'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import {
  addStep,
  backdropStrokes,
  frameSteps,
  newMarkup,
  normalizeFrame,
  removeStep,
  replaceStepStrokes,
  stepStrokes,
} from '../lib/markup'
import {
  clampPlayerHeight,
  enterFullscreen,
  exitFullscreen,
  fullscreenElement,
  readPlayerHeight,
  writePlayerHeight,
} from '../lib/playerChrome'
import {
  addClipPause,
  clipPauseTimes,
  copyText,
  formatPauseList,
  formatYoutubeChapters,
  nearestPauseIndex,
  removeClipPause,
} from '../lib/playlist'
import { buildShareUrl, shareSizeWarning, writeShareToLocation } from '../lib/share'
import { exportSession } from '../lib/storage'
import { clamp, formatTime } from '../lib/time'
import type { Clip, DrawTool, MarkupFrame, ReviewDraft, Session, Stroke } from '../types'
import { ActionToast } from './ActionToast'
import { ClipEditorSidebar } from './ClipEditorSidebar'
import { ClipSidebar } from './ClipSidebar'
import { DrawingCanvas } from './DrawingCanvas'
import { DrawingToolbar } from './DrawingToolbar'
import { PresentDrawBar, PresentOverlay } from './PresentOverlay'
import { StepRail } from './StepRail'
import { Timeline } from './Timeline'
import { Transport } from './Transport'

const TOOL_LABELS: Record<DrawTool, string> = {
  pen: 'Pen',
  arrow: 'Arrow',
  line: 'Line',
  circle: 'Circle',
  rect: 'Box',
  eraser: 'Eraser',
}

const MARKUP_SNAP = 0.45

type ReviewWorkspaceProps = {
  session: Session
  onSessionChange: (session: Session) => void
  onClose: () => void
}

function nearestMarkup(markups: MarkupFrame[], time: number): MarkupFrame | undefined {
  return markups.find((markup) => Math.abs(markup.time - time) <= MARKUP_SNAP)
}

export function ReviewWorkspace({ session, onSessionChange, onClose }: ReviewWorkspaceProps) {
  const player = useYouTubePlayer(session.videoId)
  const presenter = usePlaylistPresenter(session.clips, player)
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState('#ff3b30')
  const [brush, setBrush] = useState(0.008)
  const [title, setTitle] = useState(session.title)
  const [history, setHistory] = useState<Stroke[][]>([])
  const [future, setFuture] = useState<Stroke[][]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [playerHeight, setPlayerHeight] = useState(readPlayerHeight)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const playerStageRef = useRef<HTMLDivElement>(null)
  const holdReady = presenter.phase === 'resetReady'

  const notify = useCallback((message: string) => {
    setFlash(message)
  }, [])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 1700)
    return () => window.clearTimeout(id)
  }, [flash])

  useEffect(() => {
    const sync = () => setIsFullscreen(fullscreenElement() === playerStageRef.current)
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const host = playerStageRef.current
    if (!host) return
    if (fullscreenElement() === host) {
      void exitFullscreen()
      return
    }
    void enterFullscreen(host)
  }, [])

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    const startY = event.clientY
    const startHeight = playerHeight
    handle.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => {
      const next = clampPlayerHeight(startHeight + (move.clientY - startY))
      setPlayerHeight(next)
    }
    const onUp = (up: PointerEvent) => {
      handle.releasePointerCapture(up.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      setPlayerHeight((current) => {
        writePlayerHeight(current)
        return current
      })
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }, [playerHeight])

  const selectedClip = session.clips.find((clip) => clip.id === selectedClipId) ?? null
  const drawingSource: ReviewDraft | null =
    draft ??
    (selectedClip
      ? { inTime: selectedClip.inTime, pauseTimes: clipPauseTimes(selectedClip), markups: selectedClip.markups }
      : null)

  const activeMarkup = useMemo(() => {
    if (player.playing || !drawingSource) return null
    return nearestMarkup(drawingSource.markups, player.currentTime) ?? null
  }, [drawingSource, player.currentTime, player.playing])

  const steps = activeMarkup ? frameSteps(activeMarkup) : []
  const safeStep = Math.min(stepIndex, Math.max(0, steps.length - 1))
  const strokes = activeMarkup ? stepStrokes(activeMarkup, safeStep) : []
  const backdrop = activeMarkup ? backdropStrokes(activeMarkup, safeStep) : []
  const canDraw = player.ready && !player.playing && (!presenter.presenting || presenter.phase === 'drawing')

  useEffect(() => {
    setTitle(session.title)
  }, [session.title])

  useEffect(() => {
    if (presenter.currentClip) setSelectedClipId(presenter.currentClip.id)
  }, [presenter.currentClip])

  useEffect(() => {
    setHistory([])
    setFuture([])
    setStepIndex(0)
  }, [activeMarkup?.id, presenter.phase, presenter.pauseIndex, selectedClipId, draft?.inTime])

  const persist = useCallback(
    (next: Session) => {
      onSessionChange({ ...next, updatedAt: Date.now() })
    },
    [onSessionChange],
  )

  const writeMarkups = useCallback(
    (source: ReviewDraft, markups: MarkupFrame[], forceDraft = false) => {
      const pauseTimes = source.pauseTimes
      if (draft || forceDraft || !selectedClip) {
        setDraft({ inTime: source.inTime, pauseTimes, markups })
        return
      }
      persist({
        ...session,
        clips: session.clips.map((clip) =>
          clip.id === selectedClip.id ? { ...clip, markups, pauseTimes, pauseTime: pauseTimes[0] } : clip,
        ),
      })
    },
    [draft, persist, selectedClip, session],
  )

  const resolveSource = useCallback((): ReviewDraft => {
    if (drawingSource) return drawingSource
    return { inTime: player.getCurrentTime(), pauseTimes: [], markups: [] }
  }, [drawingSource, player])

  const writeActiveFrame = useCallback(
    (mutator: (frame: MarkupFrame) => MarkupFrame) => {
      const source = resolveSource()
      const time = player.getCurrentTime()
      let target = nearestMarkup(source.markups, time)
      let markups = source.markups
      if (!target) {
        target = newMarkup(time)
        markups = [...markups, target]
      }
      const next = mutator(normalizeFrame(target))
      writeMarkups(
        source,
        markups.map((markup) => (markup.id === next.id ? next : markup)),
        !drawingSource,
      )
      return next
    },
    [drawingSource, player, resolveSource, writeMarkups],
  )

  const updateActiveStrokes = useCallback(
    (nextStrokes: Stroke[], recordHistory = true) => {
      if (recordHistory) {
        setHistory((prev) => [...prev, strokes])
        setFuture([])
      }
      writeActiveFrame((frame) => replaceStepStrokes(frame, safeStep, nextStrokes))
    },
    [safeStep, strokes, writeActiveFrame],
  )

  const addMarkupStep = useCallback(() => {
    const next = writeActiveFrame((frame) => addStep(frame))
    setStepIndex(frameSteps(next).length - 1)
    setHistory([])
    setFuture([])
    notify(`Step ${frameSteps(next).length} started`)
  }, [notify, writeActiveFrame])

  const removeMarkupStep = useCallback(() => {
    const next = writeActiveFrame((frame) => removeStep(frame, safeStep))
    setStepIndex(Math.min(safeStep, frameSteps(next).length - 1))
    setHistory([])
    setFuture([])
    notify('Step removed')
  }, [notify, safeStep, writeActiveFrame])

  const markIn = useCallback(() => {
    if (presenter.presenting) return
    const time = player.getCurrentTime()
    setDraft({ inTime: time, pauseTimes: [], markups: [] })
    setSelectedClipId(null)
    player.pause()
    notify(`IN marked at ${formatTime(time)}`)
  }, [notify, player, presenter.presenting])

  const markOut = useCallback(() => {
    if (presenter.presenting) return
    const outTime = player.getCurrentTime()
    const source = draft ?? (selectedClip
      ? { inTime: selectedClip.inTime, pauseTimes: clipPauseTimes(selectedClip), markups: selectedClip.markups }
      : null)
    const inTime = source?.inTime ?? Math.max(0, outTime - 3)
    const markups = source?.markups ?? []
    const safeOut = Math.max(outTime, inTime + 0.4)
    const pauseTimes = clipPauseTimes({
      inTime,
      outTime: safeOut,
      pauseTimes: source?.pauseTimes,
      markups,
    })
    const clipIndex = session.clips.length + 1
    const clip: Clip = {
      id: crypto.randomUUID(),
      inTime,
      outTime: safeOut,
      pauseTimes,
      pauseTime: pauseTimes[0],
      title: `Play ${clipIndex}`,
      notes: '',
      markups,
      createdAt: Date.now(),
    }

    persist({ ...session, clips: [...session.clips, clip] })
    setDraft(null)
    setSelectedClipId(clip.id)
    player.pause()
    notify(`${clip.title} saved · ${formatTime(inTime)} to ${formatTime(safeOut)}`)
  }, [draft, notify, persist, player, presenter.presenting, selectedClip, session])

  const setTeachPause = useCallback(() => {
    if (presenter.presenting) return
    const time = player.getCurrentTime()
    if (draft) {
      const pauseTimes = addClipPause(draft.pauseTimes, time, draft.inTime, Math.max(time, draft.inTime + 0.4))
      setDraft({ ...draft, pauseTimes })
      notify(`Teach pause ${pauseTimes.length} at ${formatTime(time)}`)
      return
    }
    if (!selectedClip) {
      setDraft({ inTime: Math.max(0, time - 2), pauseTimes: [time], markups: [] })
      notify(`Teach pause set at ${formatTime(time)}`)
      return
    }
    const pauseTimes = addClipPause(clipPauseTimes(selectedClip), time, selectedClip.inTime, selectedClip.outTime)
    persist({
      ...session,
      clips: session.clips.map((clip) => (clip.id === selectedClip.id ? { ...clip, pauseTimes, pauseTime: pauseTimes[0] } : clip)),
    })
    notify(`Teach pause ${pauseTimes.length} at ${formatTime(time)}`)
  }, [draft, notify, persist, player, presenter.presenting, selectedClip, session])

  const removeTeachPause = useCallback((atTime?: number) => {
    if (presenter.presenting) return
    const time = atTime ?? player.getCurrentTime()
    if (draft) {
      const pauseTimes = removeClipPause(draft.pauseTimes, time)
      if (pauseTimes.length === draft.pauseTimes.length) {
        notify('No teach pause at this time')
        return
      }
      setDraft({ ...draft, pauseTimes })
      notify(pauseTimes.length ? 'Teach pause removed' : 'Teach pauses cleared')
      return
    }
    if (!selectedClip) return
    const current = clipPauseTimes(selectedClip)
    const pauseTimes = removeClipPause(current, time)
    if (pauseTimes.length === current.length) {
      notify('No teach pause at this time')
      return
    }
    persist({
      ...session,
      clips: session.clips.map((clip) =>
        clip.id === selectedClip.id
          ? {
              ...clip,
              pauseTimes: pauseTimes.length ? pauseTimes : clipPauseTimes({ ...clip, pauseTimes: [] }),
              pauseTime: (pauseTimes[0] ?? clipPauseTimes({ ...clip, pauseTimes: [] })[0]),
            }
          : clip,
      ),
    })
    notify(pauseTimes.length ? 'Teach pause removed' : 'Last pause reset to the midpoint')
  }, [draft, notify, persist, player, presenter.presenting, selectedClip, session])

  const cancelIn = useCallback(() => {
    setDraft(null)
    notify('IN cancelled')
  }, [notify])

  const seekToMark = useCallback(
    (time: number) => {
      if (presenter.presenting) return
      player.pause()
      player.seekTo(time)
    },
    [player, presenter.presenting],
  )

  const selectClip = useCallback(
    (clip: Clip) => {
      if (presenter.presenting) return
      setSelectedClipId(clip.id)
      setDraft(null)
      player.pause()
      player.seekTo(clip.inTime)
    },
    [player, presenter.presenting],
  )

  const focusStage = useCallback(() => {
    playerStageRef.current?.focus({ preventScroll: true })
  }, [])

  const startReview = useCallback(
    (fromIndex = 0) => {
      setDraft(null)
      const clip = session.clips[fromIndex]
      notify(clip ? `Presenting ${clip.title || `Play ${fromIndex + 1}`} — first look first` : 'Presenting playlist')
      presenter.start(fromIndex)
      const host = playerStageRef.current
      if (!host) return
      const go = () => focusStage()
      if (fullscreenElement() === host) {
        go()
        return
      }
      void enterFullscreen(host)
        .catch(() => undefined)
        .finally(go)
    },
    [focusStage, notify, presenter, session.clips],
  )

  const endReview = useCallback(() => {
    presenter.stop()
    if (fullscreenElement()) void exitFullscreen()
  }, [presenter])

  const advancePresent = useCallback(() => {
    if (presenter.phase === 'drawing') {
      if (safeStep < steps.length - 1) {
        setStepIndex(safeStep + 1)
        notify(`Step ${safeStep + 2}`)
        return
      }
      notify('Continuing the play')
      presenter.continuePlay()
      return
    }
    if (presenter.phase === 'resetReady') {
      presenter.startCoachingCountdown()
      return
    }
    if (presenter.phase === 'complete') {
      endReview()
      return
    }
    presenter.skipAhead()
  }, [endReview, notify, presenter, safeStep, steps.length])

  const updateClip = useCallback(
    (id: string, patch: Partial<Pick<Clip, 'title' | 'notes' | 'pauseTimes'>>) => {
      persist({
        ...session,
        clips: session.clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
      })
    },
    [persist, session],
  )

  const deleteClip = useCallback(
    (id: string) => {
      persist({ ...session, clips: session.clips.filter((clip) => clip.id !== id) })
      if (selectedClipId === id) setSelectedClipId(null)
    },
    [persist, selectedClipId, session],
  )

  const moveClip = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = session.clips.findIndex((clip) => clip.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= session.clips.length) return
      const clips = [...session.clips]
      const [item] = clips.splice(index, 1)
      clips.splice(nextIndex, 0, item)
      persist({ ...session, clips })
    },
    [persist, session],
  )

  const seekBy = useCallback(
    (delta: number) => {
      if (presenter.presenting) return
      const next = clamp(player.getCurrentTime() + delta, 0, player.duration || player.getCurrentTime() + delta)
      player.seekTo(next)
    },
    [player, presenter.presenting],
  )

  const copyChapters = useCallback(() => {
    void copyText(formatYoutubeChapters(session)).then(() => {
      setCopied('Copied')
      window.setTimeout(() => setCopied(null), 1600)
    })
  }, [session])

  const copyShare = useCallback(() => {
    void buildShareUrl(session).then(async (url) => {
      writeShareToLocation(url)
      try {
        await copyText(url)
        setShareCopied('Link copied')
        notify(shareSizeWarning(url) ?? 'Share link copied — send this URL to another coach')
      } catch {
        setShareCopied('Link ready')
        notify('Share link is in the address bar — copy it from there')
      }
      window.setTimeout(() => setShareCopied(null), 2000)
    })
  }, [notify, session])

  useEffect(() => {
    if (!presenter.presenting) return
    focusStage()
  }, [focusStage, presenter.phase, presenter.presenting])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        toggleFullscreen()
        return
      }

      if (presenter.presenting) {
        if (event.code === 'Space' || event.key === 'k' || event.key === 'K') {
          event.preventDefault()
          advancePresent()
          return
        }
        if (presenter.phase === 'drawing' && event.key === 'ArrowRight') {
          event.preventDefault()
          advancePresent()
          return
        }
        if (presenter.phase === 'drawing' && event.key === 'ArrowLeft') {
          event.preventDefault()
          setStepIndex(Math.max(0, safeStep - 1))
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          endReview()
        }
        return
      }

      if (event.code === 'Space' || event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        player.toggle()
        return
      }
      if (event.key === 'i' || event.key === 'I') {
        event.preventDefault()
        markIn()
        return
      }
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        if (event.shiftKey) removeTeachPause()
        else setTeachPause()
        return
      }
      if (event.key === 'o' || event.key === 'O') {
        event.preventDefault()
        markOut()
        return
      }
      if (event.key === 'Escape') {
        cancelIn()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'j' || event.key === 'J') {
        event.preventDefault()
        seekBy(event.shiftKey ? -0.25 : -2)
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'l' || event.key === 'L') {
        event.preventDefault()
        seekBy(event.shiftKey ? 0.25 : 2)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          const next = future[0]
          if (!next) return
          setFuture((prev) => prev.slice(1))
          setHistory((prev) => [...prev, strokes])
          updateActiveStrokes(next, false)
        } else {
          const prevStrokes = history[history.length - 1]
          if (!prevStrokes) return
          setHistory((prev) => prev.slice(0, -1))
          setFuture((prev) => [strokes, ...prev])
          updateActiveStrokes(prevStrokes, false)
        }
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [
    advancePresent,
    cancelIn,
    endReview,
    future,
    history,
    markIn,
    markOut,
    player,
    presenter,
    removeTeachPause,
    safeStep,
    seekBy,
    setTeachPause,
    strokes,
    toggleFullscreen,
    updateActiveStrokes,
  ])

  const commitTitle = () => {
    const next = title.trim() || session.title
    setTitle(next)
    if (next !== session.title) persist({ ...session, title: next })
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="brand-row">
          <div className="mark sm">GV</div>
          <div>
            <p className="eyebrow">{presenter.presenting ? 'Presenting playlist' : 'GameView'}</p>
            <input
              className="title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
              aria-label="Game title"
            />
          </div>
        </div>
        <div className="top-actions">
          {presenter.presenting ? (
            <button type="button" className="ghost" onClick={endReview}>
              Exit presentation
            </button>
          ) : (
            <>
              <button type="button" className="ghost" onClick={copyShare}>
                {shareCopied ?? 'Copy share link'}
              </button>
              <button type="button" className="ghost" onClick={() => exportSession(session)}>
                Export JSON
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                Change video
              </button>
            </>
          )}
        </div>
      </header>

      <div className="workspace-body">
        <section className="stage-column">
          <div
            ref={playerStageRef}
            className={`review-stage${isFullscreen ? ' is-fullscreen' : ''}${presenter.presenting ? ' is-presenting' : ''}`}
            tabIndex={-1}
          >
          <div className="player-stage">
            <div className="stage-frame" style={isFullscreen ? undefined : { height: playerHeight }}>
              <div ref={player.hostRef} className="yt-host" />
              {player.playing && presenter.phase !== 'drawing' ? (
                <button
                  type="button"
                  className="play-shield"
                  aria-label={presenter.presenting ? 'Advance review' : 'Pause video'}
                  onClick={presenter.presenting ? advancePresent : player.pause}
                />
              ) : null}
              <DrawingCanvas
                enabled={canDraw}
                strokes={player.playing ? [] : strokes}
                backdrop={player.playing ? [] : backdrop}
                tool={tool}
                color={color}
                brush={brush}
                onChange={updateActiveStrokes}
              />
              <PresentOverlay
                phase={presenter.phase}
                clip={presenter.currentClip}
                clipIndex={presenter.clipIndex}
                pauseIndex={presenter.pauseIndex}
                pauseCount={presenter.pauseCount}
                total={session.clips.length}
                holdMs={presenter.holdMs}
                holdTotal={presenter.holdTotal}
                onSkip={advancePresent}
                onReady={presenter.startCoachingCountdown}
                onExit={endReview}
              />
              <ActionToast message={flash} />
              {draft && !presenter.presenting ? (
                <div className="in-banner">
                  IN {formatTime(draft.inTime)}
                  {draft.pauseTimes.length ? ` · ${formatPauseList(draft.pauseTimes)}` : ''}
                  {' — hit OUT to add it to the playlist'}
                </div>
              ) : null}
              {player.error ? <div className="player-error">{player.error}</div> : null}
              <button
                type="button"
                className="fs-btn"
                onClick={toggleFullscreen}
                aria-pressed={isFullscreen}
              >
                {isFullscreen ? 'Exit full screen' : 'Full screen'}
              </button>
            </div>

            {isFullscreen ? null : (
              <div
                className="player-resize"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize video player"
                onPointerDown={startResize}
              />
            )}

            <Timeline
              duration={player.duration}
              currentTime={player.currentTime}
              clips={session.clips}
              draft={draft}
              selectedClipId={selectedClipId}
              locked={presenter.presenting}
              onSeek={(time) => player.seekTo(time)}
            />
          </div>

          {presenter.presenting ? null : (
            <StepRail
              enabled={canDraw}
              stepIndex={safeStep}
              stepCount={Math.max(1, steps.length)}
              onSelect={(index) => {
                setStepIndex(index)
                setHistory([])
                setFuture([])
                notify(`Step ${index + 1}`)
              }}
              onAdd={addMarkupStep}
              onRemove={removeMarkupStep}
            />
          )}

          <DrawingToolbar
            enabled={canDraw}
            tool={tool}
            color={color}
            brush={brush}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            hint={
              canDraw
                ? presenter.presenting
                  ? presenter.pauseCount > 1
                    ? `Pause ${presenter.pauseIndex + 1} of ${presenter.pauseCount}. Showing step ${safeStep + 1} of ${Math.max(1, steps.length)}.`
                    : `Showing step ${safeStep + 1} of ${Math.max(1, steps.length)}.`
                  : `Editing step ${safeStep + 1}. Add a step when this thought is done.`
                : presenter.presenting
                  ? 'Space advances the review. Tools unlock at the coach mark-up pause.'
                  : 'Pause the video to use drawing tools.'
            }
            onTool={(next) => {
              setTool(next)
              notify(`${TOOL_LABELS[next]} selected`)
            }}
            onColor={(next) => {
              setColor(next)
              notify('Color selected')
            }}
            onBrush={(next) => {
              setBrush(next)
              notify(next < 0.006 ? 'Thin stroke' : next > 0.01 ? 'Thick stroke' : 'Medium stroke')
            }}
            onUndo={() => {
              const prevStrokes = history[history.length - 1]
              if (!prevStrokes) return
              setHistory((prev) => prev.slice(0, -1))
              setFuture((prev) => [strokes, ...prev])
              updateActiveStrokes(prevStrokes, false)
              notify('Undo')
            }}
            onRedo={() => {
              const next = future[0]
              if (!next) return
              setFuture((prev) => prev.slice(1))
              setHistory((prev) => [...prev, strokes])
              updateActiveStrokes(next, false)
              notify('Redo')
            }}
            onClear={() => {
              updateActiveStrokes([])
              notify('Drawings cleared')
            }}
          />

          <div className={`stage-controls${presenter.phase === 'drawing' ? ' is-marking' : ''}`}>
          <Transport
            playing={player.playing}
            ready={player.ready}
            currentTime={player.currentTime}
            duration={player.duration}
            playbackRate={player.playbackRate}
            hasDraft={Boolean(draft)}
            presenting={presenter.presenting}
            holdReady={holdReady}
            onToggle={holdReady ? presenter.startCoachingCountdown : player.toggle}
            onSeek={seekBy}
            onRate={player.setRate}
            onMarkIn={markIn}
            onMarkOut={markOut}
            onCancelIn={cancelIn}
            onSetPause={setTeachPause}
            onRemovePause={() => removeTeachPause()}
            canRemovePause={
              nearestPauseIndex(
                draft?.pauseTimes ?? (selectedClip ? clipPauseTimes(selectedClip) : []),
                player.currentTime,
              ) >= 0
            }
          />
          <p className="shortcuts">
            {presenter.presenting
              ? 'Space advances waits, coaching steps, teach pauses, and play-out · Esc exits full screen review'
              : 'Space play/pause · F full screen · I in · P add pause · Shift+P remove pause · O out'}
          </p>
          {presenter.phase === 'drawing' ? (
            <PresentDrawBar
              stepIndex={safeStep}
              stepCount={Math.max(1, steps.length)}
              pauseIndex={presenter.pauseIndex}
              pauseCount={presenter.pauseCount}
              onBack={() => setStepIndex(Math.max(0, safeStep - 1))}
              onNext={() => setStepIndex(Math.min(steps.length - 1, safeStep + 1))}
              onContinue={() => {
                notify('Continuing the play')
                presenter.continuePlay()
              }}
            />
          ) : null}
          </div>
          </div>
        </section>

        {draft && !presenter.presenting ? (
          <ClipEditorSidebar
            inTime={draft.inTime}
            pauseTimes={draft.pauseTimes}
            currentTime={player.currentTime}
            onSeek={seekToMark}
            onRemovePause={removeTeachPause}
            onCancel={cancelIn}
          />
        ) : (
          <ClipSidebar
            clips={session.clips}
            selectedId={selectedClipId}
            presenting={presenter.presenting}
            playerReady={player.ready}
            activeIndex={presenter.presenting ? presenter.clipIndex : null}
            copied={copied}
            shareCopied={shareCopied}
            onSelect={selectClip}
            onPlay={(_clip, index) => startReview(index)}
            onPresent={startReview}
            onUpdate={updateClip}
            onDelete={deleteClip}
            onMove={moveClip}
            onCopyChapters={copyChapters}
            onCopyShare={copyShare}
            onSeek={seekToMark}
          />
        )}
      </div>
    </div>
  )
}
