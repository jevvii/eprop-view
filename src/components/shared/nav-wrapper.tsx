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
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        
        {/* Mobile Overlay */}
        {isOpen && (
          <div 
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
            onClick={close}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
          {children}
        </main>
      </div>
    </NavContext.Provider>
  )
}
