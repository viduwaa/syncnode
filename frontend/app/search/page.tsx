'use client'

import { useState, useCallback } from 'react'
import { Search as SearchIcon, Play, Plus, Loader2, Disc, Star } from 'lucide-react'
import debounce from 'lodash.debounce'
import { searchSongs, sendCommand } from '@/lib/api'
import { usePlayerStore, Track } from '@/lib/store'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const { setTrack, setIsPlaying, addToQueue, setIsExpanded } = usePlayerStore()

  const performSearch = async (q: string) => {
    if (!q) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const tracks = await searchSongs(q)
      setResults(tracks)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string) => performSearch(q), 500),
    []
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    debouncedSearch(val)
  }

  const handlePlay = async (track: Track) => {
    setTrack(track)
    setIsPlaying(true)
    setIsExpanded(true)
    
    // The backend will resolve the URL if we just send the play command with meta
    // Actually, our API spec says: {"action": "play", "url": "...", "meta": {...}}
    // So we'll let the backend resolve it first.
    // Wait, I implemented ResolveStream in the backend. 
    // I should probably have a 'play' endpoint that does resolution.
    // Instead, I'll update sendCommand to handle 'play' with an ID if URL is missing.
    
    await sendCommand('play', {
      trackId: track.id,
      meta: {
        title: track.title,
        artist: track.artist,
        img: track.thumbnail
      }
    })
    // NOTE: In the backend main.go, I need to make sure 'play' without URL triggers resolution.
  }

  return (
    <div className="flex flex-col gap-10 pb-20">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase font-display bg-gradient-to-r from-brand-orange to-brand-purple bg-clip-text text-transparent">
          Discovery
        </h1>
        <p className="text-white/40 font-medium px-1 uppercase tracking-[0.2em] text-xs">Search 100M+ Tracks</p>
      </header>
      
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-brand-orange to-brand-purple rounded-[2rem] opacity-20 group-focus-within:opacity-50 blur transition-opacity pointer-events-none" />
        <div className="relative">
          <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-white/30 w-6 h-6 transition-colors group-focus-within:text-brand-orange" />
          <input 
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Artist, song, or vibe..."
            className="w-full h-18 pl-16 pr-6 glass border border-white/10 rounded-full focus:ring-0 focus:border-brand-orange/50 transition-all outline-none text-xl font-bold placeholder:text-white/20"
          />
          {loading && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-orange" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {results.map((track, index) => (
            <motion.div 
              key={track.id} 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.05 }}
              layout
              className="group relative flex items-center gap-5 glass p-3 pr-6 rounded-3xl border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all cursor-pointer overflow-hidden"
              onClick={() => handlePlay(track)}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-brand-orange/0 via-brand-orange/5 to-brand-orange/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-brand-purple/10 flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                <Image 
                  src={track.thumbnail} 
                  alt={track.title} 
                  fill 
                  sizes="64px"
                  className="object-cover" 
                />
                <div className="absolute inset-0 bg-brand-orange/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-8 h-8 text-white fill-current" />
                </div>
              </div>

              <div className="flex-1 min-w-0 relative z-10">
                <h3 className="font-bold text-white truncate group-hover:text-brand-orange transition-colors">{track.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Disc className="w-3 h-3 text-white/40" />
                  <p className="text-sm text-white/40 truncate font-medium">{track.artist}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 relative z-10">
                <button 
                  className="p-3 rounded-xl bg-white/5 text-white/40 hover:text-brand-orange hover:bg-brand-orange/10 transition-all"
                  onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {!loading && query && results.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <Disc className="w-10 h-10 text-white/10" />
            </div>
            <p className="text-xl font-bold text-white/20 uppercase tracking-widest">Signal Lost</p>
            <p className="text-sm text-white/10 mt-2 font-medium">No results found for &ldquo;{query}&rdquo;</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
