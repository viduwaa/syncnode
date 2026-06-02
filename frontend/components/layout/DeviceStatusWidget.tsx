'use client'

import React, { useState, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { Wifi, WifiOff, Cpu, Signal, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function DeviceStatusWidget() {
  const devices = usePlayerStore((state) => state.devices)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const deviceList = Object.values(devices)
  const connectedDevices = deviceList.filter(d => d.connected)
  const isConnected = connectedDevices.length > 0

  // Get RSSI details (label, styling color, bar count)
  const getRssiDetails = (rssi: number) => {
    if (rssi >= -60) return { label: 'Excellent', color: 'text-emerald-400' }
    if (rssi >= -75) return { label: 'Good', color: 'text-brand-cyan' }
    if (rssi >= -85) return { label: 'Fair', color: 'text-amber-400' }
    return { label: 'Weak', color: 'text-rose-400' }
  }

  const formatLastSeen = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return 'Unknown'
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-full glass border border-white/10 hover:border-white/20 transition-all active:scale-95 text-xs font-bold cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          {isConnected ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : (
            <>
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </>
          )}
        </span>
        <span className="tracking-wider uppercase text-white/80">
          {isConnected ? 'ESP32 Connected' : 'Offline'}
        </span>
        {isConnected ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-rose-400" />
        )}
      </button>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-3 w-80 bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl z-50 overflow-hidden"
          >
            <div className="absolute top-0 right-0 -mr-10 -mt-10 w-24 h-24 bg-brand-orange/5 blur-2xl rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <h4 className="font-display font-black uppercase text-sm tracking-wider bg-gradient-to-r from-brand-orange to-brand-cyan bg-clip-text text-transparent">
                Hardware Node Info
              </h4>
              <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                {deviceList.length} Registered
              </span>
            </div>

            {deviceList.length === 0 ? (
              <div className="py-6 text-center">
                <Cpu className="w-8 h-8 text-white/20 mx-auto mb-2 animate-pulse" />
                <p className="text-xs text-white/40 font-medium">No ESP32 nodes detected yet</p>
                <p className="text-[10px] text-white/30 mt-1">Boot up firmware to connect</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {deviceList.map((device) => {
                  const rssi = getRssiDetails(device.rssi)
                  return (
                    <div 
                      key={device.mac} 
                      className={`p-3 rounded-xl border transition-all ${
                        device.connected 
                          ? 'bg-emerald-500/5 border-emerald-500/20' 
                          : 'bg-white/5 border-white/5 opacity-60'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Cpu className={`w-4 h-4 ${device.connected ? 'text-emerald-400' : 'text-white/30'}`} />
                          <div>
                            <p className="font-bold text-xs text-white">{device.name || 'SyncNode-ESP32'}</p>
                            <p className="text-[9px] text-white/40 font-mono tracking-tighter">{device.mac}</p>
                          </div>
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          device.connected 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : 'bg-white/5 text-white/30'
                        }`}>
                          {device.connected ? 'Online' : 'Offline'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 gap-x-1 mt-3 pt-2 border-t border-white/5 text-[10px]">
                        <div>
                          <span className="text-white/30 font-bold uppercase tracking-widest block">IP Address</span>
                          <span className="font-mono text-white/70">{device.ip || '---'}</span>
                        </div>
                        <div>
                          <span className="text-white/30 font-bold uppercase tracking-widest block">Version</span>
                          <span className="font-medium text-white/70">{device.version || '2.0.0'}</span>
                        </div>
                        {device.connected && (
                          <div>
                            <span className="text-white/30 font-bold uppercase tracking-widest block">RSSI Signal</span>
                            <span className={`font-bold flex items-center gap-1 ${rssi.color}`}>
                              <Signal className="w-3 h-3" />
                              {device.rssi} dBm ({rssi.label})
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-white/30 font-bold uppercase tracking-widest block">Last Active</span>
                          <span className="font-medium text-white/70 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-white/30" />
                            {formatLastSeen(device.lastSeen)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
