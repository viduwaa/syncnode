'use client'

import { useSession, signIn } from 'next-auth/react'
import { Music, Search, Wifi, Volume2, Zap, Play, ChevronRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function Home() {
  const { data: session, status } = useSession()

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  }

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-10 pb-12"
    >
      {/* Hero Welcome */}
      <motion.section variants={item} className="relative overflow-hidden rounded-[2.5rem] p-8 lg:p-12 glass border border-white/10">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-brand-orange/20 blur-[80px] rounded-full" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-brand-cyan animate-pulse" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Powering your IoT</span>
          </div>
          <h1 className="text-4xl lg:text-7xl font-black italic tracking-tighter uppercase leading-none mb-6">
            Pulse of the <br />
            <span className="bg-gradient-to-r from-brand-orange via-brand-purple to-brand-cyan bg-clip-text text-transparent">
              AuraStream
            </span>
          </h1>
          
          {session ? (
            <div className="flex items-center gap-4 mt-8">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-brand-orange">
                <img src={session.user?.image || ''} alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/60">Welcome back,</p>
                <p className="text-xl font-bold text-white">{session.user?.name}</p>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => signIn('google')}
              className="mt-8 bg-white text-black font-black px-8 py-4 rounded-full flex items-center gap-3 hover:scale-105 transition-transform"
            >
              Get Started
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </motion.section>

      {/* Quick Launch Grid */}
      <motion.section variants={item}>
        <h2 className="text-xl font-black uppercase tracking-widest text-white/40 mb-6 px-2">Launch Control</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/search" className="group relative overflow-hidden rounded-3xl p-8 glass border border-white/10 transition-all hover:border-brand-orange/50">
            <div className="absolute bottom-0 right-0 -br-10 -bb-10 text-brand-orange/5 group-hover:text-brand-orange/10 transition-colors translate-x-4 translate-y-4">
              <Search className="w-40 h-40" />
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="w-14 h-14 rounded-2xl bg-brand-orange/10 flex items-center justify-center mb-6 glow-orange">
                <Search className="w-7 h-7 text-brand-orange" />
              </div>
              <h3 className="text-2xl font-black uppercase italic italic text-white mb-2">Discovery</h3>
              <p className="text-white/40 font-medium">Find your vibe across 100M+ tracks</p>
              <div className="mt-8 flex items-center gap-2 text-brand-orange font-bold text-sm">
                <span>Explore Now</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </Link>

          <Link href="/library" className="group relative overflow-hidden rounded-3xl p-8 glass border border-white/10 transition-all hover:border-brand-purple/50">
            <div className="absolute bottom-0 right-0 text-brand-purple/5 group-hover:text-brand-purple/10 transition-colors translate-x-4 translate-y-4">
              <Music className="w-40 h-40" />
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="w-14 h-14 rounded-2xl bg-brand-purple/10 flex items-center justify-center mb-6 glow-cyan">
                <Music className="w-7 h-7 text-brand-purple" />
              </div>
              <h3 className="text-2xl font-black uppercase italic text-white mb-2">Sonic Vault</h3>
              <p className="text-white/40 font-medium">Your curated collection and playlists</p>
              <div className="mt-8 flex items-center gap-2 text-brand-purple font-bold text-sm">
                <span>Open Library</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        </div>
      </motion.section>

      {/* Tech Specs / Features */}
      <motion.section variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[
          { icon: Wifi, title: 'I2S Hardware', desc: 'Direct ESP32-DAC streaming', color: 'text-brand-cyan' },
          { icon: Volume2, title: 'Pro EQ', desc: '3-Band sonic refinement', color: 'text-brand-orange' },
          { icon: Zap, title: 'Zero Latency', desc: 'MQTT powered control', color: 'text-brand-purple' }
        ].map((feat, i) => (
          <div key={i} className="flex flex-col gap-4 p-6 rounded-3xl glass border border-white/5">
            <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${feat.color}`}>
              <feat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black uppercase text-sm tracking-wider text-white">{feat.title}</p>
              <p className="text-xs text-white/40 font-medium mt-1">{feat.desc}</p>
            </div>
          </div>
        ))}
      </motion.section>
    </motion.div>
  )
}
