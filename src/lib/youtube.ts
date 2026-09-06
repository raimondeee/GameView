const ID_RE = /^[a-zA-Z0-9_-]{11}$/

export function parseYouTubeId(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (ID_RE.test(value)) return value

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id && ID_RE.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const direct = url.searchParams.get('v')
      if (direct && ID_RE.test(direct)) return direct

      const parts = url.pathname.split('/').filter(Boolean)
      const prefixed = parts[0]
      const maybeId = parts[1]
      if (
        maybeId &&
        ID_RE.test(maybeId) &&
        (prefixed === 'embed' || prefixed === 'shorts' || prefixed === 'live' || prefixed === 'v')
      ) {
        return maybeId
      }
    }
  } catch {
    return null
  }

  return null
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export async function fetchVideoTitle(videoId: string): Promise<string | null> {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(videoId))}&format=json`
    const response = await fetch(endpoint)
    if (!response.ok) return null
    const data = (await response.json()) as { title?: string }
    return data.title?.trim() || null
  } catch {
    return null
  }
}

export const PLAYER_ERRORS: Record<number, string> = {
  2: 'That YouTube link looks invalid.',
  5: 'YouTube could not start the HTML5 player.',
  100: 'This video is missing or private.',
  101: 'The owner of this video turned off embedding, so it cannot play here.',
  150: 'The owner of this video turned off embedding, so it cannot play here.',
}

let apiPromise: Promise<void> | null = null

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.head.appendChild(script)
    }

    if (window.YT?.Player) resolve()
  })

  return apiPromise
}
