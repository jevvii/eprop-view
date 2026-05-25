import { ProjectGrid } from '@/components/projects/project-grid'

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Projects</h2>
        <p className="text-slate-500">Track active inspections, reports, and risk coverage by site.</p>
      </div>
      <ProjectGrid />
    </div>
  )
}
