import { useEffect, useMemo, useState } from 'react'
import { ReviewWorkspace } from './components/ReviewWorkspace'
import { VideoSetup } from './components/VideoSetup'
import { decodeShareToken, peekShareToken, sessionFromExportJson, sessionFromShareInput } from './lib/share'
import { deleteSession, getSessionByVideoId, listSessions, saveSession } from './lib/storage'
import { fetchVideoTitle, parseYouTubeId, watchUrl } from './lib/youtube'
import type { Session } from './types'

function sessionFromVideo(videoId: string, rawUrl: string, existing?: Session): Session {
  return (
    existing ?? {
      id: crypto.randomUUID(),
      videoId,
      videoUrl: rawUrl,
      title: 'Untitled game',
      clips: [],
      updatedAt: Date.now(),
    }
  )
}

function openShared(session: Session): Session {
  saveSession(session)
  return session
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [recent, setRecent] = useState<Session[]>(() => listSessions())
  const [setupError, setSetupError] = useState<string | null>(null)

  const queryVideo = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('v') || params.get('url') || ''
  }, [])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      const token = peekShareToken()
      if (token) {
        const shared = await decodeShareToken(token)
        if (!cancelled && shared) {
          setSession(openShared(shared))
          setRecent(listSessions())
          return
        }
        if (!cancelled) setSetupError('That share link could not be read. Ask the coach to send it again or use the JSON export.')
      }

      if (!queryVideo) return
      const id = parseYouTubeId(queryVideo)
      if (!id) return
      const next = sessionFromVideo(id, watchUrl(id), getSessionByVideoId(id))
      if (cancelled) return
      setSession(next)
      saveSession(next)
      setRecent(listSessions())
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [queryVideo])

  const openVideo = (rawUrl: string) => {
    void (async () => {
      const shared = await sessionFromShareInput(rawUrl)
      if (shared) {
        setSetupError(null)
        setSession(openShared(shared))
        setRecent(listSessions())
        return
      }

      const id = parseYouTubeId(rawUrl)
      if (!id) {
        setSetupError('Paste a YouTube link, a GameView share link, or an 11-character video ID.')
        return
      }

      setSetupError(null)
      const next = sessionFromVideo(id, rawUrl.trim(), getSessionByVideoId(id))
      setSession(next)
      saveSession(next)
      setRecent(listSessions())

      void fetchVideoTitle(id).then((title) => {
        if (!title) return
        setSession((current) => {
          if (!current || current.videoId !== id || current.title !== 'Untitled game') return current
          const named = { ...current, title, updatedAt: Date.now() }
          saveSession(named)
          setRecent(listSessions())
          return named
        })
      })
    })()
  }

  const importFile = (raw: string) => {
    const next = sessionFromExportJson(raw)
    if (!next) {
      setSetupError('That file is not a GameView playlist export.')
      return
    }
    setSetupError(null)
    setSession(openShared(next))
    setRecent(listSessions())
  }

  const updateSession = (next: Session) => {
    setSession(next)
    saveSession(next)
    setRecent(listSessions())
  }

  if (!session) {
    return (
      <VideoSetup
        recent={recent}
        error={setupError}
        onLoad={openVideo}
        onOpen={(item) => {
          setSetupError(null)
          setSession(item)
        }}
        onDelete={(id) => {
          deleteSession(id)
          setRecent(listSessions())
        }}
        onImportFile={importFile}
      />
    )
  }

  return (
    <ReviewWorkspace
      session={session}
      onSessionChange={updateSession}
      onClose={() => setSession(null)}
    />
  )
}
