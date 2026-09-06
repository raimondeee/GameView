import { useState, type ChangeEvent, type FormEvent } from 'react'
import { formatTime } from '../lib/time'
import type { Session } from '../types'

type VideoSetupProps = {
  recent: Session[]
  error: string | null
  onLoad: (rawUrl: string) => void
  onOpen: (session: Session) => void
  onDelete: (id: string) => void
  onImportFile: (raw: string) => void
}

export function VideoSetup({ recent, error, onLoad, onOpen, onDelete, onImportFile }: VideoSetupProps) {
  const [url, setUrl] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onLoad(url)
  }

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then(onImportFile)
  }

  return (
    <div className="setup">
      <header className="setup-brand">
        <div className="mark" aria-hidden="true">
          GV
        </div>
        <div>
          <p className="eyebrow">Youth hockey review</p>
          <h1>GameView</h1>
        </div>
      </header>

      <section className="setup-card">
        <h2>Load a game film</h2>
        <p className="lede">
          Paste a YouTube link to start a review, or paste a GameView share link to open a playlist
          another coach already built.
        </p>
        <form className="url-form" onSubmit={submit}>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="YouTube URL or GameView share link"
            autoFocus
            aria-label="YouTube or GameView share URL"
          />
          <button type="submit">Open game</button>
        </form>
        <label className="file-link">
          Open playlist file
          <input type="file" accept="application/json,.json" onChange={readFile} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      {recent.length > 0 ? (
        <section className="recent">
          <h3>Recent games</h3>
          <ul>
            {recent.map((session) => (
              <li key={session.id}>
                <button type="button" className="recent-main" onClick={() => onOpen(session)}>
                  <strong>{session.title}</strong>
                  <span>
                    {session.clips.length} clip{session.clips.length === 1 ? '' : 's'}
                    {session.clips[0] ? ` · last ${formatTime(session.clips[0].inTime)}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onDelete(session.id)}
                  aria-label={`Remove ${session.title}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
