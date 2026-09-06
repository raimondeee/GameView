import { normalizeSession } from './playlist'
import type { Session } from '../types'

const STORAGE_KEY = 'gameview.sessions.v1'

function readAll(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Session[]
    return Array.isArray(parsed) ? parsed.map((session) => normalizeSession(session)) : []
  } catch {
    return []
  }
}

function writeAll(sessions: Session[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function listSessions(): Session[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSessionByVideoId(videoId: string): Session | undefined {
  return readAll().find((session) => session.videoId === videoId)
}

export function saveSession(session: Session): void {
  const next = readAll().filter((item) => item.id !== session.id && item.videoId !== session.videoId)
  next.push(session)
  writeAll(next)
}

export function deleteSession(id: string): void {
  writeAll(readAll().filter((session) => session.id !== id))
}

export function exportSession(session: Session): void {
  const blob = new Blob([JSON.stringify({ version: 1, session }, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = session.title.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').slice(0, 60)
  link.href = url
  link.download = `${safeName || 'gameview'}-review.json`
  link.click()
  URL.revokeObjectURL(url)
}
