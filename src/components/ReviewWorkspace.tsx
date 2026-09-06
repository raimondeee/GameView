import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { clipPauseTime, copyText, formatYoutubeChapters } from '../lib/playlist'
import { buildShareUrl, shareSizeWarning, writeShareToLocation } from '../lib/share'
import { exportSession } from '../lib/storage'
import { clamp, formatTime } from '../lib/time'
import type { Clip, DrawTool, MarkupFrame, ReviewDraft, Session, Stroke } from '../types'
import { ActionToast } from './ActionToast'
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

  const notify = useCallback((message: string) => {
    setFlash(message)
  }, [])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 1700)
    return () => window.clearTimeout(id)
  }, [flash])

  const selectedClip = session.clips.find((clip) => clip.id === selectedClipId) ?? null
  const drawingSource: ReviewDraft | null =
    draft ?? (selectedClip ? { inTime: selectedClip.inTime, pauseTime: selectedClip.pauseTime, markups: selectedClip.markups } : null)

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
  }, [activeMarkup?.id, presenter.phase, selectedClipId, draft?.inTime])

  const persist = useCallback(
    (next: Session) => {
      onSessionChange({ ...next, updatedAt: Date.now() })
    },
    [onSessionChange],
  )

  const writeMarkups = useCallback(
    (source: ReviewDraft, markups: MarkupFrame[], forceDraft = false) => {
      const pauseTime = source.pauseTime ?? markups[0]?.time
      if (draft || forceDraft || !selectedClip) {
        setDraft({ inTime: source.inTime, pauseTime, markups })
        return
      }
      persist({
        ...session,
        clips: session.clips.map((clip) =>
          clip.id === selectedClip.id
            ? { ...clip, markups, pauseTime: clip.pauseTime ?? pauseTime ?? clipPauseTime(clip) }
            : clip,
        ),
      })
    },
    [draft, persist, selectedClip, session],
  )

  const resolveSource = useCallback((): ReviewDraft => {
    if (drawingSource) return drawingSource
    return { inTime: player.getCurrentTime(), markups: [] }
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
        { ...source, pauseTime: source.pauseTime ?? time },
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
    setDraft({ inTime: time, pauseTime: time, markups: [] })
    setSelectedClipId(null)
    player.pause()
    notify(`IN marked at ${formatTime(time)}`)
  }, [notify, player, presenter.presenting])

  const markOut = useCallback(() => {
    if (presenter.presenting) return
    const outTime = player.getCurrentTime()
    const source = draft ?? (selectedClip ? { inTime: selectedClip.inTime, pauseTime: selectedClip.pauseTime, markups: selectedClip.markups } : null)
    const inTime = source?.inTime ?? Math.max(0, outTime - 3)
    const markups = source?.markups ?? []
    const safeOut = Math.max(outTime, inTime + 0.4)
    const clipIndex = session.clips.length + 1
    const clip: Clip = {
      id: crypto.randomUUID(),
      inTime,
      outTime: safeOut,
      pauseTime: clipPauseTime({
        inTime,
        outTime: safeOut,
        pauseTime: source?.pauseTime ?? markups[0]?.time ?? (inTime + safeOut) / 2,
        markups,
      }),
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
      setDraft({ ...draft, pauseTime: Math.max(draft.inTime, time) })
      notify(`Teach pause set at ${formatTime(time)}`)
      return
    }
    if (!selectedClip) {
      setDraft({ inTime: Math.max(0, time - 2), pauseTime: time, markups: [] })
      notify(`Teach pause set at ${formatTime(time)}`)
      return
    }
    persist({
      ...session,
      clips: session.clips.map((clip) =>
        clip.id === selectedClip.id ? { ...clip, pauseTime: clamp(time, clip.inTime, clip.outTime) } : clip,
      ),
    })
    notify(`Teach pause set at ${formatTime(time)}`)
  }, [draft, notify, persist, player, presenter.presenting, selectedClip, session])

  const cancelIn = useCallback(() => {
    setDraft(null)
    notify('IN cancelled')
  }, [notify])

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

  const startReview = useCallback(
    (fromIndex = 0) => {
      setDraft(null)
      const clip = session.clips[fromIndex]
      notify(clip ? `Presenting ${clip.title || `Play ${fromIndex + 1}`} — first look first` : 'Presenting playlist')
      presenter.start(fromIndex)
    },
    [notify, presenter, session.clips],
  )

  const updateClip = useCallback(
    (id: string, patch: Partial<Pick<Clip, 'title' | 'notes' | 'pauseTime'>>) => {
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
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (presenter.presenting) {
        if (presenter.phase === 'drawing') {
          if (event.code === 'Space' || event.key === 'k' || event.key === 'K' || event.key === 'ArrowRight') {
            event.preventDefault()
            if (safeStep < steps.length - 1) setStepIndex(safeStep + 1)
            else presenter.continuePlay()
            return
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            setStepIndex(Math.max(0, safeStep - 1))
            return
          }
        }
        if (event.code === 'Space' || event.key === 'k' || event.key === 'K') {
          event.preventDefault()
          presenter.skipAhead()
          return
        }
        if (event.key === 'Escape') {
          presenter.stop()
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
        setTeachPause()
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

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    cancelIn,
    future,
    history,
    markIn,
    markOut,
    player,
    presenter,
    safeStep,
    seekBy,
    setTeachPause,
    steps.length,
    strokes,
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
            <button type="button" className="ghost" onClick={presenter.stop}>
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
          <div className="stage-frame">
            <div ref={player.hostRef} className="yt-host" />
            {player.playing && !presenter.presenting ? (
              <button type="button" className="play-shield" aria-label="Pause video" onClick={player.pause} />
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
              total={session.clips.length}
              holdMs={presenter.holdMs}
              holdTotal={presenter.holdTotal}
              onSkip={presenter.skipAhead}
              onExit={presenter.stop}
            />
            <ActionToast message={flash} />
            {draft && !presenter.presenting ? (
              <div className="in-banner">
                IN {formatTime(draft.inTime)}
                {draft.pauseTime !== undefined ? ` · teach pause ${formatTime(draft.pauseTime)}` : ''}
                {' — hit OUT to add it to the playlist'}
              </div>
            ) : null}
            {player.error ? <div className="player-error">{player.error}</div> : null}
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
                  ? `Showing step ${safeStep + 1} of ${Math.max(1, steps.length)}.`
                  : `Editing step ${safeStep + 1}. Add a step when this thought is done.`
                : presenter.presenting
                  ? 'Playlist is running. Tools unlock at the coach mark-up pause.'
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
          <Timeline
            duration={player.duration}
            currentTime={player.currentTime}
            clips={session.clips}
            draft={draft}
            selectedClipId={selectedClipId}
            locked={presenter.presenting}
            onSeek={(time) => player.seekTo(time)}
          />
          <Transport
            playing={player.playing}
            ready={player.ready}
            currentTime={player.currentTime}
            duration={player.duration}
            playbackRate={player.playbackRate}
            hasDraft={Boolean(draft)}
            presenting={presenter.presenting}
            onToggle={player.toggle}
            onSeek={seekBy}
            onRate={player.setRate}
            onMarkIn={markIn}
            onMarkOut={markOut}
            onCancelIn={cancelIn}
            onSetPause={setTeachPause}
          />
          <p className="shortcuts">
            Space play/pause · I in · P teach pause · O out · Present playlist for the player review
          </p>
          {presenter.phase === 'drawing' ? (
            <PresentDrawBar
              stepIndex={safeStep}
              stepCount={Math.max(1, steps.length)}
              onBack={() => setStepIndex(Math.max(0, safeStep - 1))}
              onNext={() => setStepIndex(Math.min(steps.length - 1, safeStep + 1))}
              onContinue={() => {
                notify('Continuing the play')
                presenter.continuePlay()
              }}
            />
          ) : null}
          </div>
        </section>

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
        />
      </div>
    </div>
  )
}
