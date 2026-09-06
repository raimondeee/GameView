import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { loadYouTubeApi, PLAYER_ERRORS } from '../lib/youtube'

export type PlayerControls = {
  hostRef: RefObject<HTMLDivElement | null>
  ready: boolean
  playing: boolean
  currentTime: number
  duration: number
  playbackRate: number
  error: string | null
  play: () => void
  pause: () => void
  toggle: () => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  setRate: (rate: number) => void
  getCurrentTime: () => number
}

export function useYouTubePlayer(videoId: string | null): PlayerControls {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoId) return

    let cancelled = false
    let player: YT.Player | null = null
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    host.appendChild(mount)

    loadYouTubeApi()
      .then(() => {
        if (cancelled) return

        player = new window.YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return
              setReady(true)
              setError(null)
              setDuration(event.target.getDuration() || 0)
              setPlaybackRate(event.target.getPlaybackRate() || 1)
            },
            onStateChange: (event) => {
              const state = event.data
              setPlaying(state === window.YT.PlayerState.PLAYING)
              if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.ENDED) {
                setPlaying(false)
              }
              if (typeof event.target.getCurrentTime === 'function') {
                setCurrentTime(event.target.getCurrentTime())
              }
            },
            onError: (event) => {
              setError(PLAYER_ERRORS[event.data] ?? 'YouTube could not play this video.')
              setReady(false)
            },
          },
        })
        playerRef.current = player
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the YouTube player.')
      })

    return () => {
      cancelled = true
      setReady(false)
      setPlaying(false)
      playerRef.current = null
      try {
        player?.destroy()
      } catch {
        // Player may already be gone.
      }
      mount.remove()
    }
  }, [videoId])

  useEffect(() => {
    if (!ready) return

    const id = window.setInterval(() => {
      const current = playerRef.current
      if (!current || typeof current.getCurrentTime !== 'function') return
      setCurrentTime(current.getCurrentTime())
      const nextDuration = current.getDuration()
      if (nextDuration > 0) setDuration(nextDuration)
    }, 120)

    return () => window.clearInterval(id)
  }, [ready])

  const play = useCallback(() => {
    playerRef.current?.playVideo()
  }, [])

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo()
  }, [])

  const toggle = useCallback(() => {
    if (playing) {
      playerRef.current?.pauseVideo()
    } else {
      playerRef.current?.playVideo()
    }
  }, [playing])

  const seekTo = useCallback((seconds: number, allowSeekAhead = true) => {
    playerRef.current?.seekTo(seconds, allowSeekAhead)
    setCurrentTime(seconds)
  }, [])

  const setRate = useCallback((rate: number) => {
    playerRef.current?.setPlaybackRate(rate)
    setPlaybackRate(rate)
  }, [])

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime() ?? currentTime
  }, [currentTime])

  return {
    hostRef,
    ready,
    playing,
    currentTime,
    duration,
    playbackRate,
    error,
    play,
    pause,
    toggle,
    seekTo,
    setRate,
    getCurrentTime,
  }
}
