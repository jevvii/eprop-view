'use client'

import { useState } from 'react'
import type { Inspection } from '@/app/types'
import { EmptyState, Panel } from './ui'
import { SettlementPanel } from './settlement-panel'
import { ReboundPanel } from './rebound-panel'
import { SoilPanel } from './soil-panel'
import { ErosionPanel } from './erosion-panel'
import { ForensicPanel } from './forensic-panel'
import { ChecklistPanel } from './checklist-panel'

type TabKey = 'settlement' | 'rebound' | 'soil' | 'erosion' | 'forensic' | 'checklists'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'settlement', label: 'Tilt & Settlement' },
  { key: 'rebound', label: 'Rebound Hammer' },
  { key: 'soil', label: 'Soil' },
  { key: 'erosion', label: 'Erosion' },
  { key: 'forensic', label: 'Forensic' },
  { key: 'checklists', label: 'Checklists' },
]

/**
 * Structural data captured beyond the photo record.
 *
 * Every panel reads the selected inspection from the vault, so switching the
 * inspection above switches the whole workbench rather than leaving stale data
 * from the previous one on screen.
 */
export function StructuralTabs({ inspection }: { inspection: Inspection | null }) {
  const [active, setActive] = useState<TabKey>('settlement')

  if (!inspection) {
    return (
      <Panel title="Structural Data" description="Movement, field tests, ground conditions and checklists for the selected inspection.">
        <EmptyState
          title="Select an inspection"
          message="Choose an inspection above to record movement readings, rebound tests, boreholes and checklists against it."
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Structural data sections"
        className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 no-scrollbar overscroll-contain"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active === tab.key
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels are unmounted rather than hidden so each one refetches for the
          currently selected inspection when the tab is opened. */}
      {active === 'settlement' && <SettlementPanel inspection={inspection} />}
      {active === 'rebound' && <ReboundPanel inspection={inspection} />}
      {active === 'soil' && <SoilPanel inspection={inspection} />}
      {active === 'erosion' && <ErosionPanel inspection={inspection} />}
      {active === 'forensic' && <ForensicPanel inspection={inspection} />}
      {active === 'checklists' && <ChecklistPanel inspection={inspection} />}
    </div>
  )
}
