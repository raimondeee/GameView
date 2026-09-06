const HEIGHT_KEY = 'gameview.playerHeight.v1'
const MIN_HEIGHT = 220

export function defaultPlayerHeight(): number {
  if (typeof window === 'undefined') return 420
  const width = Math.max(320, window.innerWidth - 400)
  const sixteenNine = Math.round(width * (9 / 16))
  const keepToolsVisible = Math.round(window.innerHeight - 380)
  return clampPlayerHeight(Math.min(sixteenNine, keepToolsVisible))
}

export function readPlayerHeight(): number {
  try {
    const raw = Number(localStorage.getItem(HEIGHT_KEY))
    if (Number.isFinite(raw) && raw >= MIN_HEIGHT) return clampPlayerHeight(raw)
  } catch {
    // Private mode or blocked storage.
  }
  return defaultPlayerHeight()
}

export function writePlayerHeight(height: number): void {
  try {
    localStorage.setItem(HEIGHT_KEY, String(Math.round(height)))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clampPlayerHeight(height: number): number {
  const max = typeof window === 'undefined' ? 720 : Math.round(window.innerHeight * 0.78)
  return Math.min(max, Math.max(MIN_HEIGHT, Math.round(height)))
}

type FullscreenHost = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

export function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export async function enterFullscreen(element: HTMLElement): Promise<void> {
  const host = element as FullscreenHost
  if (host.requestFullscreen) {
    await host.requestFullscreen()
    return
  }
  host.webkitRequestFullscreen?.()
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument
  if (document.exitFullscreen && document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  doc.webkitExitFullscreen?.()
}
