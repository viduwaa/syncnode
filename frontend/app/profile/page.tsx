'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { User, LogOut, Settings, Wifi, Shield, Zap, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export default function ProfilePage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-6 py-6">
        <div className="h-48 glass rounded-[2.5rem] animate-pulse" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-32 h-32 rounded-full glass border border-white/10 flex items-center justify-center mb-8"
        >
          <User className="w-16 h-16 text-white/10" />
        </motion.div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white mb-4">Identity Required</h2>
        <p className="text-white/40 max-w-sm mb-12 font-medium">
          Connect your Google presence to sync your sonic history and hardware configurations.
        </p>
        <button 
          onClick={() => signIn('google')}
          className="bg-white text-black font-black py-4 px-10 rounded-full hover:scale-105 transition-transform shadow-glow-white"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10 pb-32">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase font-display bg-gradient-to-r from-brand-orange to-brand-cyan bg-clip-text text-transparent">
          Identity
        </h1>
        <p className="text-white/40 font-medium px-1 uppercase tracking-[0.2em] text-xs">User Configuration</p>
      </header>

      {/* Modern User Hero */}
      <section className="relative overflow-hidden group p-8 lg:p-12 rounded-[2.5rem] glass border border-white/10">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-brand-orange/10 blur-[80px] rounded-full group-hover:bg-brand-orange/20 transition-colors duration-1000" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="relative w-32 h-32 lg:w-40 lg:h-40 rounded-full overflow-hidden border-4 border-brand-orange shadow-2xl">
             {session.user?.image ? (
               <Image src={session.user.image} alt="" fill className="object-cover" />
             ) : (
               <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white/20">
                 <User className="w-12 h-12" />
               </div>
             )}
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-3xl lg:text-5xl font-black italic tracking-tighter uppercase text-white mb-2">{session.user?.name}</h2>
            <p className="text-brand-orange font-black uppercase tracking-widest text-sm mb-6">{session.user?.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4">
               <div className="px-5 py-2 glass rounded-full flex items-center gap-2 border-white/5">
                  <Shield className="w-3 h-3 text-brand-cyan" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Verified User</span>
               </div>
               <div className="px-5 py-2 glass rounded-full flex items-center gap-2 border-white/5">
                  <Zap className="w-3 h-3 text-brand-orange" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">AuraStream Pro</span>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon: Wifi, title: 'Network Devices', count: '0 Detected', color: 'bg-brand-orange/10 text-brand-orange' },
          { icon: Settings, title: 'Core Settings', desc: 'Audio engine, UI', color: 'bg-brand-cyan/10 text-brand-cyan' },
          { icon: LogOut, title: 'Sign Out', action: () => signOut(), color: 'bg-red-500/10 text-red-500' },
        ].map((item, i) => (
          <button 
            key={i}
            onClick={item.action}
            className="group flex flex-col gap-6 p-8 rounded-[2rem] glass border border-white/5 hover:border-white/20 transition-all text-left"
          >
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", item.color)}>
              <item.icon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase italic tracking-tighter text-white flex items-center justify-between">
                {item.title}
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
              </h3>
              <p className="text-xs font-medium text-white/20 uppercase tracking-widest mt-1">
                {item.count || item.desc || 'Account Control'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
