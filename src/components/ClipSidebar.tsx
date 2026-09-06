import { formatRange, formatTime } from '../lib/time'
import { formatPauseList, playNumber } from '../lib/playlist'
import type { Clip } from '../types'

type ClipPatch = Partial<Pick<Clip, 'title' | 'notes' | 'pauseTimes'>>

type ClipSidebarProps = {
  clips: Clip[]
  selectedId: string | null
  presenting: boolean
  playerReady: boolean
  activeIndex: number | null
  copied: string | null
  shareCopied: string | null
  onSelect: (clip: Clip) => void
  onPlay: (clip: Clip, index: number) => void
  onPresent: (fromIndex?: number) => void
  onUpdate: (id: string, patch: ClipPatch) => void
  onDelete: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onCopyChapters: () => void
  onCopyShare: () => void
  onSeek?: (time: number) => void
}

export function ClipSidebar({
  clips,
  selectedId,
  presenting,
  playerReady,
  activeIndex,
  copied,
  shareCopied,
  onSelect,
  onPlay,
  onPresent,
  onUpdate,
  onDelete,
  onMove,
  onCopyChapters,
  onCopyShare,
  onSeek,
}: ClipSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>Playlist</h2>
        <span>{clips.length}</span>
      </div>
      <p className="empty-clips">
        Bookmarks on the full YouTube game. Present the playlist to turn a long film into a short
        review with text between plays.
      </p>

      {clips.length > 0 ? (
        <div className="playlist-actions">
          <button type="button" className="play-btn" onClick={() => onPresent(0)} disabled={presenting || !playerReady}>
            Present playlist
          </button>
          <button type="button" className="ghost" onClick={onCopyShare} disabled={presenting}>
            {shareCopied ?? 'Copy share link'}
          </button>
          <button type="button" className="ghost" onClick={onCopyChapters}>
            {copied ?? 'Copy YouTube timestamps'}
          </button>
        </div>
      ) : null}

      {clips.length === 0 ? (
        <p className="empty-clips">
          Mark <strong>IN</strong> when a play starts, add one or more teach pauses, then mark{' '}
          <strong>OUT</strong>.
        </p>
      ) : (
        <ul className="clip-list">
          {clips.map((clip, index) => {
            const selected = clip.id === selectedId
            const live = presenting && activeIndex === index
            return (
              <li key={clip.id} className={`${selected ? 'is-selected' : ''}${live ? ' is-live' : ''}`}>
                <button type="button" className="clip-hit" onClick={() => onSelect(clip)}>
                  <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="clip-meta">
                    <strong>{clip.title || playNumber(index)}</strong>
                    <em>
                      {formatRange(clip.inTime, clip.outTime)} · {formatPauseList(clip.pauseTimes)}
                    </em>
                  </span>
                </button>
                <div className="clip-actions">
                  <button type="button" onClick={() => onPlay(clip, index)} disabled={presenting || !playerReady}>
                    Review
                  </button>
                  <button type="button" onClick={() => onMove(clip.id, -1)} disabled={index === 0 || presenting}>
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(clip.id, 1)}
                    disabled={index === clips.length - 1 || presenting}
                  >
                    Down
                  </button>
                  <button type="button" className="danger" onClick={() => onDelete(clip.id)} disabled={presenting}>
                    Delete
                  </button>
                </div>
                {selected ? (
                  <div className="clip-edit">
                    <label>
                      Title
                      <input
                        value={clip.title}
                        onChange={(event) => onUpdate(clip.id, { title: event.target.value })}
                      />
                    </label>
                    <label>
                      Coach notes
                      <textarea
                        rows={3}
                        value={clip.notes}
                        placeholder="What should the players see here?"
                        onChange={(event) => onUpdate(clip.id, { notes: event.target.value })}
                      />
                    </label>
                    {onSeek ? (
                      <div className="clip-marks">
                        <button type="button" onClick={() => onSeek(clip.inTime)}>
                          IN {formatTime(clip.inTime)}
                        </button>
                        {clip.pauseTimes.map((time, pauseIndex) => (
                          <button key={`${clip.id}-p-${pauseIndex}`} type="button" onClick={() => onSeek(time)}>
                            P{pauseIndex + 1} {formatTime(time)}
                          </button>
                        ))}
                        <button type="button" onClick={() => onSeek(clip.outTime)}>
                          OUT {formatTime(clip.outTime)}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
