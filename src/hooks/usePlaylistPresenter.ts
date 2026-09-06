import { useCallback, useEffect, useRef, useState } from 'react'
import { clipPauseTimes, coachingFromTime, coachingToTime } from '../lib/playlist'
import type { Clip, PresentPhase } from '../types'
import type { PlayerControls } from './useYouTubePlayer'

const ANNOUNCE_MS = 5200
const RESET_MS = 5000
const SEEK_ARM_MS = 320

type Presenter = {
  phase: PresentPhase
  clipIndex: number
  pauseIndex: number
  pauseCount: number
  presenting: boolean
  currentClip: Clip | null
  holdMs: number
  holdTotal: number
  start: (fromIndex?: number) => void
  stop: () => void
  continuePlay: () => void
  skipAhead: () => void
  startCoachingCountdown: () => void
}

export function usePlaylistPresenter(clips: Clip[], player: PlayerControls): Presenter {
  const [phase, setPhase] = useState<PresentPhase>('off')
  const [clipIndex, setClipIndex] = useState(0)
  const [pauseIndex, setPauseIndex] = useState(0)
  const [holdMs, setHoldMs] = useState(0)
  const [holdTotal, setHoldTotal] = useState(0)
  const holdUntilRef = useRef(0)
  const armedRef = useRef(false)
  const phaseRef = useRef<PresentPhase>('off')
  const indexRef = useRef(0)
  const pauseIndexRef = useRef(0)
  const clipsRef = useRef(clips)
  const playerRef = useRef(player)
  const timersRef = useRef<number[]>([])

  clipsRef.current = clips
  playerRef.current = player
  phaseRef.current = phase
  indexRef.current = clipIndex
  pauseIndexRef.current = pauseIndex

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }, [])

  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    timersRef.current.push(id)
  }, [])

  const setPhaseBoth = (next: PresentPhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const setPauseBoth = (next: number) => {
    pauseIndexRef.current = next
    setPauseIndex(next)
  }

  const beginHold = (ms: number) => {
    holdUntilRef.current = Date.now() + ms
    setHoldTotal(ms)
    setHoldMs(ms)
  }

  const startFirstLook = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      if (!clip) return
      clearTimers()
      armedRef.current = false
      setPhaseBoth('firstLook')
      api.setRate(1)
      api.seekTo(clip.inTime)
      later(SEEK_ARM_MS, () => {
        armedRef.current = true
        api.play()
      })
    },
    [clearTimers, later],
  )

  const startToPause = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      if (!clip) return
      clearTimers()
      armedRef.current = false
      setPhaseBoth('toPause')
      api.seekTo(coachingFromTime(clip, pauseIndexRef.current))
      later(SEEK_ARM_MS, () => {
        armedRef.current = true
        api.play()
      })
    },
    [clearTimers, later],
  )

  const startDrawing = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      if (!clip) return
      clearTimers()
      armedRef.current = false
      api.pause()
      api.seekTo(coachingToTime(clip, pauseIndexRef.current))
      setPhaseBoth('drawing')
    },
    [clearTimers],
  )

  const startResetGate = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      if (!clip) return
      clearTimers()
      armedRef.current = false
      api.pause()
      api.seekTo(clip.inTime)
      setHoldMs(0)
      setHoldTotal(0)
      setPauseBoth(0)
      setPhaseBoth('resetReady')
    },
    [clearTimers],
  )

  const startResetTimer = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      if (!clip) return
      clearTimers()
      armedRef.current = false
      api.pause()
      api.seekTo(clip.inTime)
      setPauseBoth(0)
      setPhaseBoth('reset')
      beginHold(RESET_MS)
      later(RESET_MS, () => startToPause(index))
    },
    [clearTimers, later, startToPause],
  )

  const startCoachingCountdown = useCallback(() => {
    if (phaseRef.current !== 'resetReady') return
    startResetTimer(indexRef.current)
  }, [startResetTimer])

  const announce = useCallback(
    (index: number) => {
      const clip = clipsRef.current[index]
      const api = playerRef.current
      clearTimers()
      armedRef.current = false
      if (!clip) {
        api.pause()
        setPhaseBoth('complete')
        return
      }
      indexRef.current = index
      setClipIndex(index)
      setPauseBoth(0)
      setPhaseBoth('announce')
      api.pause()
      api.seekTo(clip.inTime)
      beginHold(ANNOUNCE_MS)
      later(ANNOUNCE_MS, () => startFirstLook(index))
    },
    [clearTimers, later, startFirstLook],
  )

  const continuePlay = useCallback(() => {
    const index = indexRef.current
    const clip = clipsRef.current[index]
    const api = playerRef.current
    if (!clip || phaseRef.current !== 'drawing') return
    const pauses = clipPauseTimes(clip)
    const nextPause = pauseIndexRef.current + 1
    clearTimers()
    armedRef.current = false
    if (nextPause < pauses.length) {
      setPauseBoth(nextPause)
      setPhaseBoth('toPause')
      api.seekTo(pauses[nextPause - 1] ?? clip.inTime)
      later(SEEK_ARM_MS, () => {
        armedRef.current = true
        api.play()
      })
      return
    }
    setPhaseBoth('finish')
    api.seekTo(pauses[pauses.length - 1] ?? clip.inTime)
    later(SEEK_ARM_MS, () => {
      armedRef.current = true
      api.play()
    })
  }, [clearTimers, later])

  const finishClip = useCallback(
    (index: number) => {
      const api = playerRef.current
      const next = index + 1
      if (next < clipsRef.current.length) {
        announce(next)
        return
      }
      clearTimers()
      armedRef.current = false
      api.pause()
      setPhaseBoth('complete')
    },
    [announce, clearTimers],
  )

  const stop = useCallback(() => {
    clearTimers()
    armedRef.current = false
    setPauseBoth(0)
    setPhaseBoth('off')
    playerRef.current.pause()
  }, [clearTimers])

  useEffect(() => {
    if (phase !== 'announce' && phase !== 'reset') {
      setHoldMs(0)
      return
    }
    const id = window.setInterval(() => {
      setHoldMs(Math.max(0, holdUntilRef.current - Date.now()))
    }, 80)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'firstLook' && phase !== 'toPause' && phase !== 'finish') return
    if (!armedRef.current || !player.playing) return

    const clip = clips[clipIndex]
    if (!clip) return

    const target = phase === 'toPause' ? coachingToTime(clip, pauseIndex) : clip.outTime
    if (player.currentTime + 0.08 >= target) {
      if (phase === 'firstLook') startResetGate(clipIndex)
      else if (phase === 'toPause') startDrawing(clipIndex)
      else finishClip(clipIndex)
    }
  }, [clipIndex, clips, finishClip, pauseIndex, phase, player.currentTime, player.playing, startDrawing, startResetGate])

  const skipAhead = useCallback(() => {
    const index = indexRef.current
    const current = phaseRef.current
    if (current === 'announce') startFirstLook(index)
    else if (current === 'firstLook') startResetGate(index)
    else if (current === 'resetReady') startResetTimer(index)
    else if (current === 'reset') startToPause(index)
    else if (current === 'toPause') startDrawing(index)
    else if (current === 'drawing') continuePlay()
    else if (current === 'finish') finishClip(index)
    else if (current === 'complete') stop()
  }, [continuePlay, finishClip, startDrawing, startFirstLook, startResetGate, startResetTimer, startToPause, stop])

  const start = useCallback(
    (fromIndex = 0) => {
      if (!clipsRef.current.length) return
      const last = clipsRef.current.length - 1
      announce(Math.min(last, Math.max(0, fromIndex)))
    },
    [announce],
  )

  useEffect(() => () => clearTimers(), [clearTimers])

  const currentClip = phase === 'off' ? null : (clips[clipIndex] ?? null)

  return {
    phase,
    clipIndex,
    pauseIndex,
    pauseCount: currentClip ? clipPauseTimes(currentClip).length : 0,
    presenting: phase !== 'off',
    currentClip,
    holdMs,
    holdTotal,
    start,
    stop,
    continuePlay,
    skipAhead,
    startCoachingCountdown,
  }
}
