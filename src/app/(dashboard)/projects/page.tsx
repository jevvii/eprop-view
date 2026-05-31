import { ProjectGrid } from '@/components/projects/project-grid'

export default function ProjectsPage() {
  return (
    <div className="space-y-10">
      <div className="px-2">
        <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Active Projects</h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Track active inspections, reports, and risk coverage by site.</p>
      </div>
      <ProjectGrid />
    </div>
  )
}
