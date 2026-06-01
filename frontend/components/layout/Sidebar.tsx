'use client'

import { Home, Search, Library, User, Music, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useSession, signOut } from 'next-auth/react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const links = [
    { name: 'Home', icon: Home, path: '/' },
    { name: 'Search', icon: Search, path: '/search' },
    { name: 'Library', icon: Library, path: '/library' },
    { name: 'Profile', icon: User, path: '/profile' },
  ]

  return (
    <aside className="hidden lg:flex flex-col w-72 h-screen fixed left-0 top-0 glass border-r border-white/10 p-6 z-40">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 rounded-xl bg-brand-orange glow-orange flex items-center justify-center">
          <Music className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-black italic tracking-tighter uppercase font-display bg-gradient-to-r from-brand-orange to-brand-cyan bg-clip-text text-transparent">
          AuraStream
        </h1>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {links.map((link) => {
          const isActive = pathname === link.path
          const Icon = link.icon

          return (
            <Link
              key={link.name}
              href={link.path}
              className={cn(
                "relative flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 group",
                isActive
                  ? "text-white"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-gradient-to-r from-brand-orange/20 to-transparent rounded-2xl border-l-2 border-brand-orange"
                  transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                />
              )}
              <Icon className={cn("w-5 h-5 relative z-10", isActive && "text-brand-orange text-glow")} />
              <span className="font-bold tracking-wide relative z-10">{link.name}</span>
            </Link>
          )
        })}
      </nav>

      {session && (
        <div className="mt-auto pt-6 border-t border-white/5 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-brand-cyan/20">
              <img src={session.user?.image || ''} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-white truncate">{session.user?.name}</p>
              <p className="text-xs text-white/40 truncate">{session.user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-white/40 hover:text-white hover:bg-red-500/10 transition-all group"
          >
            <LogOut className="w-5 h-5 group-hover:text-red-500" />
            <span className="font-bold text-sm">Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  )
}
