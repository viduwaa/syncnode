'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Play, Pause, SkipForward, SkipBack, ChevronDown, 
  Settings2, ListMusic, Volume2, VolumeX, Heart, 
  Repeat, Shuffle, MoreHorizontal, Radio, Disc, Sparkles, Loader2
} from 'lucide-react'
import { usePlayerStore } from '@/lib/store'
import Image from 'next/image'
import { sendCommand } from '@/lib/api'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export default function MiniPlayer() {
  const { 
    currentTrack, isPlaying, setIsPlaying, isLoading, queue, eq, setEQ, volume, setVolume,
    isExpanded, setIsExpanded, progress, duration, setProgress
  } = usePlayerStore()

  const [showEQ, setShowEQ] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const prevTrackId = useRef<string | null>(null)

  // Track changes checking
  useEffect(() => {
    if (currentTrack?.id && currentTrack.id !== prevTrackId.current) {
      console.log('🎵 Track changed:', currentTrack.title)
      console.log('📊 New duration:', duration, 'Progress:', progress)
      prevTrackId.current = currentTrack.id
    }
  }, [currentTrack?.id, currentTrack?.title, duration, progress])

  // Debug: Log duration changes
  useEffect(() => {
    console.log('⏱️ Duration changed:', duration, 'isPlaying:', isPlaying)
  }, [duration, isPlaying])

  if (!currentTrack) return null

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0

  const handleTogglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const newPlaying = !isPlaying
    setIsPlaying(newPlaying)
    await sendCommand(newPlaying ? 'resume' : 'pause')
  }

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await sendCommand('skip')
  }

  const handlePrevious = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await sendCommand('previous')
  }

  const handleEqChange = async (band: 'bass' | 'mid' | 'treble', value: number) => {
    setEQ(band, value)
    await sendCommand('eq', { band, gain: value })
  }

  const handleVolumeChange = async (value: number) => {
    setVolume(value)
    await sendCommand('volume', value)
  }

  return (
    <>
      {/* ========== MINI PLAYER BAR ========== */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={() => setIsExpanded(true)}
            className="fixed bottom-24 lg:bottom-6 left-4 right-4 lg:left-80 lg:right-6 h-20 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden z-[50] shadow-2xl cursor-pointer group"
          >
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
              <motion.div 
                className="h-full bg-gradient-to-r from-brand-orange to-brand-purple shadow-glow-orange"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center h-full px-4 gap-4 relative z-10">
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform">
                {currentTrack.thumbnail && (
                  <Image src={currentTrack.thumbnail} alt="" fill className="object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center">
                     <Play className="w-4 h-4 fill-current ml-0.5" />
                   </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black uppercase italic tracking-tight text-white truncate leading-tight">
                  {currentTrack.title}
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-orange">Now Playing</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <p className="text-[10px] font-bold text-white/40 truncate uppercase tracking-wider">
                    {currentTrack.artist}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleTogglePlay} 
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-90"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <button 
                  onClick={handleNext}
                  className="hidden sm:flex w-12 h-12 items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-90"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== FULL PLAYER OVERLAY ========== */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl overflow-y-auto"
          >
            {/* Immersive Background Artwork */}
            <div className="fixed inset-0 pointer-events-none opacity-20 scale-125 blur-[120px]">
               {currentTrack.thumbnail && <Image src={currentTrack.thumbnail} alt="" fill className="object-cover" />}
            </div>

            <div className="relative min-h-screen flex flex-col max-w-5xl mx-auto px-6 pt-12 pb-24">
              {/* Header */}
              <div className="flex items-center justify-between mb-12">
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="w-12 h-12 glass rounded-full flex items-center justify-center transition-transform hover:scale-110"
                >
                  <ChevronDown className="w-8 h-8 text-white" />
                </button>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 text-brand-orange mb-1">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Quantum Stream</span>
                  </div>
                  <p className="text-xs font-bold text-white/20 uppercase tracking-widest">AuraStream Engine v2.0</p>
                </div>
                <button className="w-12 h-12 glass rounded-full flex items-center justify-center opacity-0 pointer-events-none">
                  <MoreHorizontal className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Artwork Section */}
                <div className="flex flex-col items-center">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative group"
                  >
                    <div className="absolute -inset-10 bg-gradient-to-br from-brand-orange/40 via-brand-purple/20 to-brand-cyan/40 blur-[80px] rounded-full group-hover:opacity-100 opacity-60 transition-opacity duration-1000" />
                    <div className="relative w-48 h-48 sm:w-64 sm:h-64 lg:w-[400px] lg:h-[400px] rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
                      {currentTrack.thumbnail && (
                        <Image src={currentTrack.thumbnail} alt={currentTrack.title} fill className="object-cover" priority />
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* Info and Controls Section */}
                <div className="flex flex-col gap-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <motion.h2 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="text-2xl sm:text-4xl lg:text-5xl font-black italic tracking-tighter uppercase leading-tight mb-2 text-white line-clamp-2"
                      >
                        {currentTrack.title}
                      </motion.h2>
                      <motion.p 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl lg:text-2xl font-black uppercase tracking-[0.1em] text-brand-orange"
                      >
                        {currentTrack.artist}
                      </motion.p>
                    </div>
                    <button 
                      onClick={() => setIsLiked(!isLiked)}
                      className={cn(
                        "w-14 h-14 rounded-2xl glass flex items-center justify-center transition-all",
                        isLiked ? "text-brand-orange border-brand-orange/30" : "text-white/20 border-white/5"
                      )}
                    >
                      <Heart className={cn("w-7 h-7", isLiked && "fill-current")} />
                    </button>
                  </div>

                  {/* High Fidelity Progress Slider */}
                  <div className="flex flex-col gap-4">
                    <div className="relative h-2 w-full glass rounded-full overflow-hidden">
                       <motion.div 
                         className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-orange to-brand-purple rounded-full shadow-glow-orange"
                         style={{ width: `${progressPercent}%` }}
                       />
                    </div>
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-white/20">
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Energetic Control Unit */}
                  <div className="flex items-center justify-between gap-6 py-4">
                    <button className="text-white/20 hover:text-white transition-colors">
                      <Shuffle className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-10">
                      <button onClick={handlePrevious} className="text-white hover:scale-125 transition-transform active:scale-90">
                        <SkipBack className="w-10 h-10 fill-current" />
                      </button>
                      <button 
                        onClick={handleTogglePlay}
                        className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center shadow-glow-white hover:scale-110 active:scale-95 transition-transform"
                      >
                        {isLoading ? <Loader2 className="w-10 h-10 animate-spin" /> : isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-2" />}
                      </button>
                      <button onClick={handleNext} className="text-white hover:scale-125 transition-transform active:scale-90">
                        <SkipForward className="w-10 h-10 fill-current" />
                      </button>
                    </div>
                    <button className="text-white/20 hover:text-white transition-colors">
                      <Repeat className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Hardware Control Panels */}
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setShowEQ(!showEQ)}
                      className={cn(
                        "flex flex-col gap-3 p-6 rounded-[2rem] border transition-all glass items-center",
                        showEQ ? "border-brand-orange/40 bg-brand-orange/5" : "border-white/5"
                      )}
                    >
                      <Settings2 className={cn("w-6 h-6", showEQ ? "text-brand-orange" : "text-white/20")} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Signal EQ</span>
                    </button>
                    <button className="flex flex-col gap-3 p-6 rounded-[2rem] border border-white/5 glass items-center">
                      <div className="relative">
                        <ListMusic className="w-6 h-6 text-white/20" />
                        <span className="absolute -top-1 -right-1 bg-brand-cyan text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center text-black">
                          {queue.length}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sequence</span>
                    </button>
                  </div>

                  {/* EQ Detailed Sliders (Embedded) */}
                  <AnimatePresence>
                    {showEQ && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="glass border border-brand-orange/20 rounded-[2rem] p-8 overflow-hidden"
                      >
                         <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-orange mb-8 text-center underline decoration-brand-orange/30 underline-offset-8">Quantum Frequency Adjustment</h3>
                         <div className="space-y-8">
                            {(['bass', 'mid', 'treble'] as const).map((band) => (
                              <div key={band} className="flex flex-col gap-2">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{band}</span>
                                  <span className="text-xs font-black text-brand-orange">{eq[band] > 0 ? `+${eq[band]}` : eq[band]} dB</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="-10" 
                                  max="10" 
                                  value={eq[band]}
                                  onChange={(e) => handleEqChange(band, parseInt(e.target.value))}
                                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-brand-orange"
                                />
                              </div>
                            ))}
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Volume Control Bar */}
                  <div className="flex items-center gap-6 px-4">
                    <button onClick={() => handleVolumeChange(volume === 0 ? 70 : 0)} className="text-white/20">
                      {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <div className="relative flex-1 h-1 glass rounded-full">
                       <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={volume}
                        onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                      />
                      <motion.div 
                        className="h-full bg-white/40 rounded-full"
                        style={{ width: `${volume}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
