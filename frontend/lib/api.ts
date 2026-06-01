const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

export async function sendCommand(action: string, value?: any, mac?: string) {
  const url = new URL(`${BACKEND_URL}/api/control`)
  if (mac) url.searchParams.set('mac', mac)

  const body: any = { action }
  if (typeof value === 'number') body.value = value
  if (typeof value === 'object') {
    if (value.trackId) body.trackId = value.trackId
    else if (value.id) body.trackId = value.id
    if (value.url) body.url = value.url
    if (value.meta) body.meta = value.meta
    if (value.band) body.band = value.band
    if (value.gain !== undefined) body.gain = value.gain
    
    // Playback context for playlist navigation
    if (value.contextType) body.contextType = value.contextType
    if (value.contextId) body.contextId = value.contextId
    if (value.contextTracks) body.contextTracks = value.contextTracks
    if (value.contextIndex !== undefined) body.contextIndex = value.contextIndex
  }

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.json()
}

export async function searchSongs(query: string) {
  const resp = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`)
  if (!resp.ok) throw new Error('Search failed')
  return resp.json()
}

export async function getDevices() {
  const resp = await fetch(`${BACKEND_URL}/api/devices`)
  if (!resp.ok) throw new Error('Failed to fetch devices')
  return resp.json()
}

export async function updateQueue(queue: any[]) {
  const resp = await fetch(`${BACKEND_URL}/api/queue`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queue),
  })
  return resp.json()
}

export async function fetchLikedSongs(accessToken: string) {
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?myRating=like&part=snippet&maxResults=20`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}))
    console.error('YouTube API Error (Liked Songs):', resp.status, errorData)
    throw new Error(`Failed to fetch liked songs: ${resp.status}`)
  }
  const data = await resp.json()
  return data.items.map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    source: 'youtube',
    sourceId: item.id
  }))
}

export async function fetchPlaylists(accessToken: string) {
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/playlists?mine=true&part=snippet,contentDetails&maxResults=20`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}))
    console.error('YouTube API Error (Playlists):', resp.status, errorData)
    throw new Error(`Failed to fetch playlists: ${resp.status}`)
  }
  const data = await resp.json()
  return data.items.map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    itemCount: item.contentDetails?.itemCount || 0
  }))
}

export async function fetchPlaylistItems(playlistId: string, accessToken: string) {
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${playlistId}&part=snippet&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}))
    console.error('YouTube API Error (PlaylistItems):', resp.status, errorData)
    throw new Error(`Failed to fetch playlist items: ${resp.status}`)
  }
  const data = await resp.json()
  return data.items.map((item: any) => ({
    id: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    artist: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    source: 'youtube',
    sourceId: item.snippet.resourceId.videoId
  }))
}
