import { normalizeFrame } from './markup'
import { clamp, formatTime } from './time'
import type { Clip, Session } from '../types'

export function clipPauseTime(clip: Pick<Clip, 'inTime' | 'outTime' | 'pauseTime' | 'markups'>): number {
  const fallback = clip.markups[0]?.time ?? (clip.inTime + clip.outTime) / 2
  const raw = Number.isFinite(clip.pauseTime) ? clip.pauseTime : fallback
  const span = clip.outTime - clip.inTime
  const pad = span > 1 ? 0.15 : 0
  return clamp(raw, clip.inTime + pad, Math.max(clip.inTime, clip.outTime - pad))
}

export function normalizeClip(clip: Clip): Clip {
  return {
    ...clip,
    pauseTime: clipPauseTime({
      ...clip,
      pauseTime: clip.pauseTime ?? clip.markups[0]?.time ?? (clip.inTime + clip.outTime) / 2,
    }),
    markups: (clip.markups ?? []).map((frame) => normalizeFrame(frame)),
    notes: clip.notes ?? '',
  }
}

export function normalizeSession(session: Session): Session {
  return {
    ...session,
    clips: (session.clips ?? []).map((clip) => normalizeClip(clip)),
  }
}

export function playNumber(index: number): string {
  return `Play ${index + 1}`
}

export function playHeading(index: number): string {
  return playNumber(index)
}

export function playSubhead(clip: Clip): string {
  const title = clip.title.trim()
  if (!title || /^play\s+\d+$/i.test(title) || /^clip\s+\d+$/i.test(title)) {
    return clip.notes.trim().split('\n')[0] || 'Full play, then breakdown'
  }
  return title
}

export function formatYoutubeChapters(session: Session): string {
  const lines = ['0:00 Game start']
  session.clips.forEach((clip, index) => {
    const title = clip.title.trim() || playNumber(index)
    lines.push(`${formatTime(clip.inTime)} ${playNumber(index)} — ${title}`)
  })
  return lines.join('\n')
}

export function copyText(value: string): Promise<void> {
  return navigator.clipboard.writeText(value)
}
