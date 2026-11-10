'use client'

import { useState, createContext, useContext, ReactNode } from 'react'
import { Sidebar } from '@/components/shared/sidebar'

interface NavContextType {
  isOpen: boolean
  toggle: () => void
  close: () => void
}

const NavContext = createContext<NavContextType | undefined>(undefined)

export function useNav() {
  const context = useContext(NavContext)
  if (!context) throw new Error('useNav must be used within NavProvider')
  return context
}

export function NavWrapper({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = () => setIsOpen(!isOpen)
  const close = () => setIsOpen(false)

  return (
    <NavContext.Provider value={{ isOpen, toggle, close }}>
      <div className="flex h-dvh min-h-dvh overflow-hidden print:h-auto print:overflow-visible bg-slate-50 overscroll-contain">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary focus:shadow-lg"
        >
          Skip to content
        </a>
        <Sidebar />

        {/* Mobile Overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity no-print"
            onClick={close}
            aria-hidden="true"
          />
        )}

        {/* Single scroll owner for the whole shell. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible relative [scroll-padding-block-start:5rem] pb-[env(safe-area-inset-bottom)] overscroll-contain"
        >
          {children}
        </main>
      </div>
    </NavContext.Provider>
  )
}
