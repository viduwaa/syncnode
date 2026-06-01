'use client'

import { Home, Search, Library, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export default function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Home', icon: Home, path: '/' },
    { name: 'Search', icon: Search, path: '/search' },
    { name: 'Library', icon: Library, path: '/library' },
    { name: 'Profile', icon: User, path: '/profile' },
  ]

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 glass-nav rounded-full px-6 py-3 z-50 border border-white/10 shadow-2xl">
      <div className="flex gap-8 items-center justify-center">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path
          const Icon = tab.icon
          
          return (
            <Link 
              key={tab.name} 
              href={tab.path}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-all duration-300 group",
                isActive 
                  ? "text-brand-orange" 
                  : "text-white/40 hover:text-white"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="active-tab"
                  className="absolute -inset-x-3 -inset-y-2 bg-brand-orange/10 rounded-xl glow-orange"
                  transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                />
              )}
              <Icon className={cn("w-6 h-6 relative z-10", isActive && "text-glow")} />
              <span className={cn(
                "text-[8px] font-black uppercase tracking-widest relative z-10 opacity-0 group-hover:opacity-100 transition-opacity",
                isActive && "opacity-100"
              )}>
                {tab.name}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
