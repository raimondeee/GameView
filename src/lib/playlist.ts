import { normalizeFrame } from './markup'
import { clamp, formatTime } from './time'
import type { Clip, Session } from '../types'

export const PAUSE_SNAP = 0.45
const PAUSE_GAP = 0.35

type PauseSource = {
  inTime: number
  outTime: number
  pauseTimes?: number[]
  pauseTime?: number
  markups?: { time: number }[]
}

function pauseBounds(clip: Pick<PauseSource, 'inTime' | 'outTime'>): { lo: number; hi: number } {
  const span = clip.outTime - clip.inTime
  const pad = span > 1 ? 0.15 : 0
  const lo = clip.inTime + pad
  return { lo, hi: Math.max(lo, clip.outTime - pad) }
}

export function clipPauseTimes(clip: PauseSource): number[] {
  const raw =
    Array.isArray(clip.pauseTimes) && clip.pauseTimes.length > 0
      ? clip.pauseTimes
      : Number.isFinite(clip.pauseTime)
        ? [clip.pauseTime as number]
        : []
  const { lo, hi } = pauseBounds(clip)
  const cleaned: number[] = []
  for (const value of raw) {
    if (!Number.isFinite(value)) continue
    const next = clamp(value, lo, hi)
    const near = cleaned.findIndex((time) => Math.abs(time - next) < PAUSE_GAP)
    if (near >= 0) cleaned[near] = next
    else cleaned.push(next)
  }
  cleaned.sort((left, right) => left - right)
  if (cleaned.length) return cleaned
  const fallback = clip.markups?.[0]?.time ?? (clip.inTime + clip.outTime) / 2
  return [clamp(fallback, lo, hi)]
}

export function clipPauseTime(clip: PauseSource): number {
  return clipPauseTimes(clip)[0]
}

export function addClipPause(times: number[], time: number, inTime: number, outTime: number): number[] {
  return clipPauseTimes({ inTime, outTime, pauseTimes: [...times, time] })
}

export function removeClipPause(times: number[], time: number): number[] {
  const index = nearestPauseIndex(times, time)
  if (index < 0) return times
  return times.filter((_, item) => item !== index)
}

export function nearestPauseIndex(times: number[], time: number, snap = PAUSE_SNAP): number {
  if (!times.length) return -1
  let best = 0
  let bestDist = Math.abs(times[0] - time)
  for (let index = 1; index < times.length; index += 1) {
    const dist = Math.abs(times[index] - time)
    if (dist < bestDist) {
      best = index
      bestDist = dist
    }
  }
  return bestDist <= snap ? best : -1
}

export function formatPauseList(times: number[]): string {
  if (times.length <= 1) return `pause ${formatTime(times[0] ?? 0)}`
  return `${times.length} pauses ${times.map((time) => formatTime(time)).join(', ')}`
}

export function coachingFromTime(clip: PauseSource, pauseIndex: number): number {
  const pauses = clipPauseTimes(clip)
  if (pauseIndex <= 0) return clip.inTime
  return pauses[pauseIndex - 1] ?? clip.inTime
}

export function coachingToTime(clip: PauseSource, pauseIndex: number): number {
  const pauses = clipPauseTimes(clip)
  return pauses[pauseIndex] ?? clipPauseTime(clip)
}

export function normalizeClip(clip: Omit<Clip, 'pauseTimes'> & { pauseTimes?: number[]; pauseTime?: number }): Clip {
  const pauseTimes = clipPauseTimes(clip)
  return {
    ...clip,
    pauseTimes,
    pauseTime: pauseTimes[0],
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
