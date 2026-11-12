'use client'

import { Panel } from '@/components/structural/ui'
import {
  ACI_224R_EXPOSURE_LIMITS_MM,
  CRACK_WIDTH_BANDS,
  EXPOSURE_LABELS,
} from '@/app/lib/structural/crack-taxonomy'
import { COST_TABLE_VERSION, ELEMENT_MULTIPLIERS, formatPhp, tableEstimate } from '@/app/lib/structural/cost-table'
import {
  DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM,
  TILT_THRESHOLDS_MM_PER_M,
} from '@/app/lib/structural/settlement'
import { REBOUND_CORRELATION_REFERENCE } from '@/app/lib/structural/rebound'

/**
 * What the system is actually applying.
 *
 * These values are compiled into the code rather than configurable at run time.
 * Showing them here means an admin can answer "why did it say monitor?" without
 * reading the source.
 */
export function ConfigurationPanel() {
  return (
    <div className="space-y-6">
      <Panel title="Crack Classification" description={`Project-defined width bands; ACI 224R-01 exposure guidance. Table version ${COST_TABLE_VERSION}.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[420px]">
            <thead>
              <tr>
                {['Band', 'Width range'].map((heading) => (
                  <th key={heading} scope="col" className="text-[10px] font-bold text-slate-500 pb-2 pr-3 border-b border-slate-200">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRACK_WIDTH_BANDS.map((band) => (
                <tr key={band.band} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-xs font-semibold text-slate-800 capitalize">{band.band}</td>
                  <td className="py-2 pr-3 text-xs text-slate-600 font-medium">{band.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1.5">Tolerable width by exposure</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(ACI_224R_EXPOSURE_LIMITS_MM).map(([exposure, limit]) => (
              <li key={exposure} className="text-xs text-slate-700 font-medium">
                {EXPOSURE_LABELS[exposure as keyof typeof EXPOSURE_LABELS]} · {limit.toFixed(2)} mm
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Movement Thresholds" description="Applied to every settlement reading. The worse of the two governs.">
        <ul className="space-y-1.5">
          <li className="text-xs text-slate-700 font-medium">
            Tilt · monitor above <strong>{TILT_THRESHOLDS_MM_PER_M.monitor} mm/m</strong> (1/500), action above{' '}
            <strong>{TILT_THRESHOLDS_MM_PER_M.action} mm/m</strong> (1/250)
          </li>
          <li className="text-xs text-slate-700 font-medium">
            Differential settlement · monitor above <strong>{DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.monitor} mm</strong>, action above{' '}
            <strong>{DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.action} mm</strong>
          </li>
        </ul>
      </Panel>

      <Panel title="Cost Model" description="Planning-level table, in PHP. The divergence band decides when an AI figure needs a written justification.">
        <p className="text-xs text-slate-700 font-medium">
          Divergence is flagged when the AI likely figure falls outside 0.5×–2.0× the table value.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(ELEMENT_MULTIPLIERS).map(([element, multiplier]) => (
            <div key={element} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold text-slate-500">{element}</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{multiplier}×</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 font-medium">
          Example · a medium crack on a column estimates{' '}
          {formatPhp(tableEstimate('crack', 'medium', 'column'))}, which is the figure the report shows.
        </p>
      </Panel>

      <Panel title="Rebound Hammer" description="The correlation used to turn a rebound number into a strength.">
        <p className="text-xs text-slate-700 font-medium">{REBOUND_CORRELATION_REFERENCE}</p>
        <p className="text-[11px] text-slate-500 font-medium">
          Outliers are rejected at median ± 1.5 × IQR, and the rule is abandoned if it would leave fewer than two readings.
        </p>
      </Panel>
    </div>
  )
}
