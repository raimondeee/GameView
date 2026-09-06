import { clipPauseTime, normalizeSession } from './playlist'
import type { Clip, MarkupFrame, Session, ShapeTool, Stroke } from '../types'

const SHARE_VERSION = 1
const SOFT_LIMIT = 28000
const HARD_LIMIT = 140000

type PackedStroke = [ShapeTool, string, number, number[]]
type PackedMarkup = [number, PackedStroke[] | PackedStroke[][]]
type PackedClip = [number, number, number | number[], string, string, PackedMarkup[]]

type PackedShare = {
  v: number
  id: string
  vid: string
  title: string
  clips: PackedClip[]
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function packStroke(stroke: Stroke): PackedStroke {
  const points: number[] = []
  for (const point of stroke.points) {
    points.push(round(point.x), round(point.y))
  }
  return [stroke.tool, stroke.color, round(stroke.width), points]
}

function unpackStroke(packed: PackedStroke): Stroke {
  const [tool, color, width, flat] = packed
  const points = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    points.push({ x: flat[i], y: flat[i + 1] })
  }
  return {
    id: crypto.randomUUID(),
    tool,
    color,
    width,
    points,
  }
}

function packSession(session: Session): PackedShare {
  return {
    v: SHARE_VERSION,
    id: session.id,
    vid: session.videoId,
    title: session.title,
    clips: session.clips.map((clip) => [
      round(clip.inTime),
      round(clip.outTime),
      clip.pauseTimes.length > 1 ? clip.pauseTimes.map(round) : round(clipPauseTime(clip)),
      clip.title,
      clip.notes,
      clip.markups.map((markup) => [
        round(markup.time),
        markup.steps.map((step) => step.strokes.map(packStroke)),
      ] as PackedMarkup),
    ]),
  }
}

function unpackSession(packed: PackedShare): Session {
  const clips: Clip[] = packed.clips.map((clip) => {
    const markups: MarkupFrame[] = clip[5].map((markup) => {
      const payload = markup[1]
      const first = payload[0]
      const isLegacy = Array.isArray(first) && typeof first[0] === 'string'
      const stepPacks = isLegacy ? [payload as PackedStroke[]] : (payload as PackedStroke[][])
      return {
        id: crypto.randomUUID(),
        time: markup[0],
        steps: stepPacks.map((strokes) => ({
          id: crypto.randomUUID(),
          strokes: strokes.map(unpackStroke),
        })),
      }
    })
    const packedPauses = clip[2]
    const pauseTimes = Array.isArray(packedPauses) ? packedPauses : [packedPauses]
    return {
      id: crypto.randomUUID(),
      inTime: clip[0],
      outTime: clip[1],
      pauseTimes,
      pauseTime: pauseTimes[0],
      title: clip[3],
      notes: clip[4],
      markups,
      createdAt: Date.now(),
    }
  })

  return normalizeSession({
    id: packed.id || crypto.randomUUID(),
    videoId: packed.vid,
    videoUrl: `https://www.youtube.com/watch?v=${packed.vid}`,
    title: packed.title || 'Shared game',
    clips,
    updatedAt: Date.now(),
  })
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function compressPayload(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    return `u.${bytesToBase64Url(new TextEncoder().encode(json))}`
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return `g.${bytesToBase64Url(new Uint8Array(buffer))}`
}

async function decompressPayload(token: string): Promise<string> {
  const [kind, data] = token.includes('.') ? token.split('.', 2) : ['g', token]
  const bytes = base64UrlToBytes(data)
  if (kind === 'u') return new TextDecoder().decode(bytes)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

export function peekShareToken(input = window.location.hash): string | null {
  const hash = input.startsWith('#') ? input.slice(1) : input
  if (!hash) return null
  try {
    const fromHash = new URLSearchParams(hash).get('p')
    if (fromHash) return fromHash
  } catch {
    return null
  }
  return null
}

export function extractShareToken(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return peekShareToken(url.hash)
  } catch {
    return peekShareToken(value.startsWith('#') ? value : `#${value}`)
  }
}

export async function encodeShareToken(session: Session): Promise<string> {
  return compressPayload(JSON.stringify(packSession(session)))
}

export async function decodeShareToken(token: string): Promise<Session | null> {
  try {
    const raw = await decompressPayload(token)
    const packed = JSON.parse(raw) as PackedShare
    if (!packed || packed.v !== SHARE_VERSION || !packed.vid || !Array.isArray(packed.clips)) {
      return null
    }
    return unpackSession(packed)
  } catch {
    return null
  }
}

export async function buildShareUrl(
  session: Session,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
  path = typeof window === 'undefined' ? '/' : window.location.pathname || '/',
): Promise<string> {
  const token = await encodeShareToken(session)
  return `${origin}${path}?v=${encodeURIComponent(session.videoId)}#p=${token}`
}

export async function sessionFromShareInput(input: string): Promise<Session | null> {
  const token = extractShareToken(input)
  if (!token) return null
  return decodeShareToken(token)
}

export function sessionFromExportJson(raw: string): Session | null {
  try {
    const parsed = JSON.parse(raw) as { session?: Session } & Session
    const session = 'session' in parsed && parsed.session ? parsed.session : parsed
    if (!session.videoId || !Array.isArray(session.clips)) return null
    return normalizeSession({
      ...session,
      id: session.id || crypto.randomUUID(),
      videoUrl: session.videoUrl || `https://www.youtube.com/watch?v=${session.videoId}`,
      title: session.title || 'Imported game',
      updatedAt: Date.now(),
    })
  } catch {
    return null
  }
}

export function shareSizeWarning(url: string): string | null {
  if (url.length > HARD_LIMIT) {
    return 'This playlist is very large. The link may not open in some browsers — send the JSON export too.'
  }
  if (url.length > SOFT_LIMIT) {
    return 'This is a long share link. It should work, but the JSON export is a safer backup.'
  }
  return null
}

export function writeShareToLocation(url: string): void {
  const next = new URL(url)
  const path = `${next.pathname}${next.search}${next.hash}`
  window.history.replaceState(null, '', path)
}
