import { InspectionForm } from '@/components/document/inspection-form'
import { ImageUpload } from '@/components/document/image-upload'

export default function DocumentPage() {
  return (
    <div className="space-y-10">
      <div className="px-2">
        <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Inspection Documents</h2>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Log inspection findings and attach site imagery.</p>
      </div>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <InspectionForm />
        <ImageUpload />
      </div>
    </div>
  )
}
