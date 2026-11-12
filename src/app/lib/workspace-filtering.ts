import { scoreToRiskLevel } from './damage-score'
import type { Inspection, Report } from '@/app/types'
import type { WorkspaceFilters } from './workspace-filters'

/**
 * Client-side workspace filtering.
 *
 * The datasets this app serves are small (single-digit thousands at most), so
 * filtering in memory is both instant and honest: one fetch per page load, no
 * request per keystroke. These predicates mirror the previous server rules so
 * switching the data path did not change what a filter means.
 */

function riskMatches(score: number, risk: WorkspaceFilters['risk']): boolean {
  return risk === 'all' || scoreToRiskLevel(score) === risk
}

function withinRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!date) return !from && !to
  const day = date.slice(0, 10)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function textMatches(query: string, ...parts: (string | null | undefined)[]): boolean {
  if (!query) return true
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query)
}

export function filterReports(
  reports: Report[] | undefined,
  filters: WorkspaceFilters
): Report[] {
  const query = filters.q.trim().toLowerCase()

  return (reports ?? []).filter(
    (report) =>
      (filters.status === 'all' || report.status === filters.status) &&
      riskMatches(report.risk_score, filters.risk) &&
      withinRange(report.date, filters.from, filters.to) &&
      textMatches(query, report.report_id, report.title, report.location, report.project_name, report.key_findings)
  )
}

export function filterInspections(
  inspections: Inspection[] | undefined,
  filters: WorkspaceFilters
): Inspection[] {
  const query = filters.q.trim().toLowerCase()

  return (inspections ?? []).filter(
    (inspection) =>
      (filters.status === 'all' || inspection.status === filters.status) &&
      riskMatches(inspection.risk_score, filters.risk) &&
      (!filters.building || inspection.building_id === filters.building) &&
      (!filters.floor || inspection.floor_id === filters.floor) &&
      (!filters.element || inspection.structural_element_id === filters.element) &&
      withinRange(inspection.inspection_date, filters.from, filters.to) &&
      textMatches(query, inspection.location, inspection.notes, inspection.building_name, inspection.element_identifier)
  )
}

/** Fields that a reports view can meaningfully apply. */
export const REPORT_FILTER_FIELDS: (keyof WorkspaceFilters)[] = [
  'q',
  'status',
  'risk',
  'from',
  'to',
]

/** Fields that an inspections view can meaningfully apply. */
export const INSPECTION_FILTER_FIELDS: (keyof WorkspaceFilters)[] = [
  'q',
  'status',
  'risk',
  'building',
  'floor',
  'element',
  'from',
  'to',
]
