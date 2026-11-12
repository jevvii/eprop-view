import { ProjectGrid } from '@/components/projects/project-grid'

export default function ProjectsPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="px-1 sm:px-2">
        <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Active Projects</h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">Track active inspections, reports, and risk coverage by site.</p>
      </div>
      <ProjectGrid />
    </div>
  )
}
