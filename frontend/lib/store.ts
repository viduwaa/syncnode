import { create } from 'zustand'

export interface Track {
  id: string
  title: string
  artist: string
  thumbnail: string
  duration: number
  source: string
  sourceId: string
  streamUrl?: string
}

export interface QueueItem {
  id: string
  track: Track
  addedBy?: string
  addedAt: number
}

export interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  isLoading: boolean
  progress: number
  duration: number
  volume: number
  queue: QueueItem[]
  eq: {
    bass: number
    mid: number
    treble: number
  }
  activeDeviceId: string | null
  
  // Actions
  setTrack: (track: Track | null) => void
  setIsPlaying: (playing: boolean) => void
  setProgress: (progress: number) => void
  setVolume: (volume: number) => void
  setQueue: (queue: QueueItem[]) => void
  addToQueue: (track: Track) => void
  removeFromQueue: (id: string) => void
  setEQ: (band: 'bass' | 'mid' | 'treble', value: number) => void
  setActiveDevice: (id: string | null) => void
  updateState: (partial: Partial<PlayerState>) => void
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  duration: 0,
  volume: 70,
  queue: [],
  eq: { bass: 0, mid: 0, treble: 0 },
  activeDeviceId: null,

  setTrack: (track) => set({ currentTrack: track, progress: 0 }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setProgress: (progress) => set({ progress }),
  setVolume: (volume) => set({ volume }),
  setQueue: (queue) => set({ queue }),
  addToQueue: (track) => set((state) => ({ 
    queue: [...state.queue, { id: Math.random().toString(), track, addedAt: Date.now() }] 
  })),
  removeFromQueue: (id) => set((state) => ({ 
    queue: state.queue.filter(t => t.id !== id) 
  })),
  setEQ: (band, value) => set((state) => ({
    eq: { ...state.eq, [band]: value }
  })),
  setActiveDevice: (id) => set({ activeDeviceId: id }),
  updateState: (partial) => set((state) => ({ ...state, ...partial })),
  isExpanded: false,
  setIsExpanded: (expanded) => set({ isExpanded: expanded }),
}))

