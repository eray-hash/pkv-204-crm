import { useRef, useState, type ChangeEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastContext'
import { Card, SectionHeader, Button, Badge } from '../components/ui'
import { PlayCircle, UploadCloud } from 'lucide-react'

export default function Hilfe() {
  const { state } = useApp()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploaded, setUploaded] = useState<string[]>([])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) {
      const names = Array.from(files).map((f) => f.name)
      setUploaded((prev) => [...prev, ...names])
      showToast(`${names.length} Datei(en) hochgeladen (Mockup)`)
    }
    e.target.value = ''
  }

  return (
    <div>
      <SectionHeader
        title="Hilfe / Onboarding"
        subtitle="Schulungsvideos und Materialien rund um das CRM und die §204-Tarifoptimierung"
        actions={
          <Button onClick={() => fileInputRef.current?.click()}>
            <UploadCloud size={16} /> Video hochladen
          </Button>
        }
      />
      <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFileChange} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {state.onboardingVideos.map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <div className="flex h-32 items-center justify-center bg-ink-800/95">
              <PlayCircle size={44} className="text-white/90" />
            </div>
            <div className="p-4">
              <p className="font-medium text-ink-800">{v.titel}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-400">
                <Badge tone="brand">{v.kategorie}</Badge>
                <span>{v.dauer} Min.</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {uploaded.length > 0 && (
        <Card className="mt-6 p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Kürzlich hochgeladen</h2>
          <ul className="space-y-1 text-sm text-ink-500">
            {uploaded.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
