import { InspectionForm } from '@/components/document/inspection-form'
import { ImageUpload } from '@/components/document/image-upload'

export default function DocumentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Inspection Documents</h2>
        <p className="text-slate-500">Log inspection findings and attach site imagery.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <InspectionForm />
        <ImageUpload />
      </div>
    </div>
  )
}
