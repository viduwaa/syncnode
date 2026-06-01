'use client'

import { useState, useEffect, useCallback } from 'react'
import { Music, Heart, ListMusic, Play, Plus, Loader2, ChevronLeft, Disc, Sparkles } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { fetchLikedSongs, fetchPlaylists, fetchPlaylistItems, sendCommand } from '@/lib/api'
import { usePlayerStore, Track } from '@/lib/store'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

export default function LibraryPage() {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState<'liked' | 'playlists'>('liked')
  const [likedSongs, setLikedSongs] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<any[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  
  const { setTrack, setIsPlaying, addToQueue, setIsExpanded } = usePlayerStore()

  const loadLibrary = useCallback(async () => {
    if (status !== 'authenticated' || !session?.accessToken) return
    
    setLoading(true)
    try {
      if (activeTab === 'liked') {
        const songs = await fetchLikedSongs(session.accessToken as string)
        setLikedSongs(songs)
      } else {
        const lists = await fetchPlaylists(session.accessToken as string)
        setPlaylists(lists)
      }
    } catch (err) {
      console.error('Failed to load library:', err)
    } finally {
      setLoading(false)
    }
  }, [status, session, activeTab])

  useEffect(() => {
    if (!selectedPlaylist) {
      loadLibrary()
    }
  }, [loadLibrary, selectedPlaylist])

  const handlePlaylistClick = async (pl: any) => {
    if (status !== 'authenticated' || !session?.accessToken) return
    setSelectedPlaylist(pl)
    setLoading(true)
    try {
      const tracks = await fetchPlaylistItems(pl.id, session.accessToken as string)
      setPlaylistTracks(tracks)
    } catch (err) {
      console.error('Failed to load playlist tracks:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = async (
    track: Track, 
    context?: { type: 'playlist' | 'liked', id?: string, tracks: Track[], index: number }
  ) => {
    setTrack(track)
    setIsPlaying(true)
    setIsExpanded(true)
    
    const command: any = {
      trackId: track.id,
      meta: {
        title: track.title,
        artist: track.artist,
        img: track.thumbnail
      }
    }
    
    // Add playlist context if provided
    if (context) {
      command.contextType = 'playlist'
      command.contextId = context.id || (context.type === 'liked' ? 'liked-songs' : '')
      command.contextTracks = context.tracks
      command.contextIndex = context.index
    }
    
    await sendCommand('play', command)
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-32 h-32 rounded-full glass flex items-center justify-center mb-8 border-brand-orange/20"
        >
          <Heart className="w-16 h-16 text-brand-orange/20" />
        </motion.div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white mb-4">Pulse Missing</h2>
        <p className="text-white/40 max-w-sm mb-8 font-medium">
          Sync your YouTube identity to unlock your curated sonic vault.
        </p>
      </div>
    )
  }

  if (selectedPlaylist) {
    return (
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="flex flex-col gap-8 pb-32"
      >
        <button 
          onClick={() => setSelectedPlaylist(null)}
          className="flex items-center gap-3 text-white/40 hover:text-brand-orange transition-colors w-fit px-2"
        >
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </div>
          <span className="font-black uppercase tracking-[0.2em] text-[10px]">Back to Sonic Vault</span>
        </button>

        <div className="relative group p-8 lg:p-12 rounded-[2.5rem] overflow-hidden glass border border-white/10">
          <div className="absolute inset-0 z-0">
            <Image 
              src={selectedPlaylist.thumbnail} 
              alt="" 
              fill 
              className="object-cover blur-[60px] opacity-30 scale-110"
            />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-end">
            <div className="relative w-48 h-48 lg:w-64 lg:h-64 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/10">
              <Image 
                src={selectedPlaylist.thumbnail} 
                alt={selectedPlaylist.title} 
                fill 
                className="object-cover" 
              />
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                <Music className="w-4 h-4 text-brand-cyan" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Playlist Collection</span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-black tracking-tighter text-white mb-4 line-clamp-2 uppercase italic">
                {selectedPlaylist.title}
              </h1>
              <div className="flex items-center justify-center md:justify-start gap-4">
                <p className="text-sm font-black text-brand-orange uppercase tracking-widest">{selectedPlaylist.itemCount} Tracks</p>
                <button 
                  onClick={() => playlistTracks.length > 0 && handlePlay(playlistTracks[0], { type: 'playlist', id: selectedPlaylist.id, tracks: playlistTracks, index: 0 })}
                  className="bg-white text-black w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
                >
                  <Play className="fill-current w-5 h-5 ml-1" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
              <p className="text-white/20 font-black uppercase tracking-[0.3em] text-[10px]">Decoding Playlist...</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {playlistTracks.map((track, index) => (
                <motion.div 
                  key={track.id} 
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="group flex items-center gap-5 glass p-3 pr-6 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all cursor-pointer"
                  onClick={() => handlePlay(track, { 
                    type: 'playlist', 
                    id: selectedPlaylist.id, 
                    tracks: playlistTracks, 
                    index 
                  })}
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
                    <Image 
                      src={track.thumbnail} 
                      alt={track.title} 
                      fill 
                      sizes="48px"
                      className="object-cover" 
                    />
                    <div className="absolute inset-0 bg-brand-orange/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-current" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate text-sm text-white group-hover:text-brand-orange transition-colors">{track.title}</h3>
                    <p className="text-[10px] text-white/40 truncate uppercase tracking-widest font-black mt-0.5">{track.artist}</p>
                  </div>
                  <button 
                    className="p-3 text-white/20 hover:text-brand-orange hover:bg-brand-orange/10 rounded-xl transition-all"
                    onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col gap-10 pb-32">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase font-display bg-gradient-to-r from-brand-purple via-brand-cyan to-brand-orange bg-clip-text text-transparent">
          Sonic Vault
        </h1>
        <p className="text-white/40 font-medium px-1 uppercase tracking-[0.2em] text-xs">Your Curated Collection</p>
      </header>

      {/* Modern Tabs */}
      <div className="relative flex p-1 glass border border-white/10 rounded-3xl w-fit">
        <div className="absolute inset-y-1 transition-all duration-500 ease-spring" 
             style={{ 
               left: activeTab === 'liked' ? '4px' : 'calc(50% + 1px)',
               width: 'calc(50% - 5px)',
               backgroundColor: 'rgb(255 92 0 / 0.1)',
               borderRadius: '1.25rem',
               border: '1px solid rgb(255 92 0 / 0.2)',
               boxShadow: '0 0 15px rgb(255 92 0 / 0.1)'
             }} 
        />
        <button 
          onClick={() => setActiveTab('liked')}
          className={`relative z-10 flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
            activeTab === 'liked' ? 'text-brand-orange' : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Heart className={`w-4 h-4 ${activeTab === 'liked' ? 'fill-current text-glow' : ''}`} />
          Liked
        </button>
        <button 
          onClick={() => setActiveTab('playlists')}
          className={`relative z-10 flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
            activeTab === 'playlists' ? 'text-brand-orange' : 'text-white/40 hover:text-white/60'
          }`}
        >
          <ListMusic className={`w-4 h-4 ${activeTab === 'playlists' ? 'text-glow' : ''}`} />
          Playlists
        </button>
      </div>

      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-brand-orange" />
              <div className="absolute inset-0 animate-ping opacity-20 text-brand-orange">
                <Loader2 className="w-12 h-12" />
              </div>
            </div>
            <p className="text-white/20 font-black uppercase tracking-[0.4em] text-[10px]">Syncing with YouTube Library...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {activeTab === 'liked' ? (
                likedSongs.length > 0 ? (
                  likedSongs.map((track, index) => (
                    <motion.div 
                      key={track.id} 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="group flex items-center gap-4 glass p-3 pr-5 rounded-2xl border border-white/5 hover:border-brand-orange/30 hover:bg-brand-orange/5 transition-all cursor-pointer"
                      onClick={() => handlePlay(track, { 
                        type: 'liked', 
                        tracks: likedSongs, 
                        index 
                      })}
                    >
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
                        <Image 
                          src={track.thumbnail} 
                          alt={track.title} 
                          fill 
                          sizes="56px"
                          className="object-cover" 
                        />
                        <div className="absolute inset-0 bg-brand-orange/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-current" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate text-sm text-white group-hover:text-brand-orange transition-colors">{track.title}</h3>
                        <p className="text-xs text-white/40 truncate font-medium">{track.artist}</p>
                      </div>
                      <button 
                        className="p-2 text-white/20 hover:text-brand-orange transition-colors"
                        onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full"><EmptyState type="liked" /></div>
                )
              ) : (
                playlists.length > 0 ? (
                  playlists.map((pl, index) => (
                    <motion.div 
                      key={pl.id} 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="group flex flex-col gap-4 glass p-4 rounded-[2rem] border border-white/5 hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-all cursor-pointer"
                      onClick={() => handlePlaylistClick(pl)}
                    >
                      <div className="relative aspect-square rounded-3xl overflow-hidden bg-white/5 shadow-2xl">
                        <Image 
                          src={pl.thumbnail} 
                          alt={pl.title} 
                          fill 
                          className="object-cover group-hover:scale-110 transition-transform duration-700" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                           <div className="w-12 h-12 rounded-full bg-brand-purple flex items-center justify-center glow-cyan shadow-lg">
                              <Play className="w-6 h-6 text-white fill-current ml-1" />
                           </div>
                        </div>
                      </div>
                      <div className="px-2">
                        <h3 className="font-black text-white truncate text-lg uppercase italic tracking-tight group-hover:text-brand-purple transition-colors">{pl.title}</h3>
                        <p className="text-xs text-white/40 font-black uppercase tracking-widest mt-1">{pl.itemCount} tracks</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full"><EmptyState type="playlists" /></div>
                )
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

function EmptyState({ type }: { type: 'liked' | 'playlists' }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10">
        <Disc className="w-12 h-12 text-white/10 animate-spin-slow" />
      </div>
      <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white/40 mb-3">
        {type === 'liked' ? 'Vault.empty()' : 'Playlists.not_found()'}
      </h2>
      <p className="text-white/20 max-w-xs text-sm font-medium">
        {type === 'liked' 
          ? "The sonic signal is weak. Your YouTube liked collection didn't broadcast."
          : "No structural data found for your YouTube playlists."
        }
      </p>
    </div>
  )
}
