import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createProject, startPipeline } from '@/lib/api'

const CUSTOM_SENTINEL = '__custom__'

const FRONTEND_OPTIONS = [
  'Next.js', 'React', 'Vue', 'Nuxt.js', 'Svelte', 'SvelteKit',
  'Angular', 'Astro', 'Remix', 'Vanilla JS',
]
const BACKEND_OPTIONS = [
  'NestJS', 'Express', 'Fastify', 'Hono',
  'FastAPI', 'Django', 'Flask',
  'Spring Boot', 'Gin', 'Rails', 'Laravel',
]
const DATABASE_OPTIONS = [
  'PostgreSQL', 'MySQL', 'MongoDB', 'SQLite',
  'MariaDB', 'Redis', 'DynamoDB', 'Firestore',
  'Cassandra', 'Supabase',
]

type StackKey = 'frontend' | 'backend' | 'database'

interface FieldState {
  selectVal: string
  customVal: string
  isCustom: boolean
}

const DEFAULT_FIELD: Record<StackKey, FieldState> = {
  frontend: { selectVal: 'Next.js', customVal: '', isCustom: false },
  backend: { selectVal: 'NestJS', customVal: '', isCustom: false },
  database: { selectVal: 'PostgreSQL', customVal: '', isCustom: false },
}

export function NewProjectPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [requirements, setRequirements] = useState('')
  const [fields, setFields] = useState<Record<StackKey, FieldState>>(DEFAULT_FIELD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getStackValue = (key: StackKey) =>
    fields[key].isCustom ? fields[key].customVal.trim() : fields[key].selectVal

  const handleSelectChange = (key: StackKey, val: string) => {
    if (val === CUSTOM_SENTINEL) {
      setFields((prev) => ({ ...prev, [key]: { ...prev[key], isCustom: true, customVal: '' } }))
    } else {
      setFields((prev) => ({ ...prev, [key]: { ...prev[key], isCustom: false, selectVal: val } }))
    }
  }

  const handleCustomChange = (key: StackKey, val: string) => {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], customVal: val } }))
  }

  const resetToSelect = (key: StackKey) => {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], isCustom: false, customVal: '' } }))
  }

  const isStackValid = (['frontend', 'backend', 'database'] as StackKey[]).every(
    (k) => getStackValue(k).length > 0,
  )

  const isValid =
    name.trim().length >= 1 &&
    name.trim().length <= 200 &&
    requirements.trim().length >= 10 &&
    isStackValid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setLoading(true)
    setError(null)

    try {
      const project = await createProject({
        name: name.trim(),
        requirements: requirements.trim(),
        techStack: {
          frontend: getStackValue('frontend'),
          backend: getStackValue('backend'),
          database: getStackValue('database'),
        },
      })
      await startPipeline(project.id)
      navigate(`/projects/${project.id}/pipeline`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로젝트 생성에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* 뒤로가기 */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-mono text-text-muted hover:text-foreground transition-colors cursor-pointer mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </button>

        <h1 className="text-2xl font-mono font-bold text-foreground mb-1">새 프로젝트 만들기</h1>
        <p className="text-sm text-text-muted mb-8">
          요구사항을 자연어로 자유롭게 설명해주세요
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 프로젝트명 */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-text-muted" htmlFor="project-name">
              프로젝트명
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="내 SaaS 프로젝트"
              maxLength={200}
            />
            <p className="text-xs text-text-muted text-right">{name.length}/200</p>
          </div>

          {/* 요구사항 */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-text-muted" htmlFor="requirements">
              요구사항 (자연어로 자유롭게 입력)
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <Textarea
              id="requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder={`사용자가 월정액을 내고 콘텐츠를 구독하는 서비스.\n관리자가 콘텐츠를 업로드하고, 구독자만 열람 가능.\n결제는 MVP에서 제외.`}
              rows={8}
              className="resize-none leading-relaxed"
            />
            <p className={`text-xs text-right ${requirements.length < 10 ? 'text-text-muted' : 'text-accent-green'}`}>
              {requirements.length}자 (최소 10자)
            </p>
          </div>

          {/* 기술 스택 */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-text-muted">기술 스택</p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { key: 'frontend' as StackKey, label: 'Frontend', options: FRONTEND_OPTIONS },
                  { key: 'backend' as StackKey, label: 'Backend', options: BACKEND_OPTIONS },
                  { key: 'database' as StackKey, label: 'Database', options: DATABASE_OPTIONS },
                ] as const
              ).map(({ key, label, options }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-mono text-text-muted">{label}</label>
                  {fields[key].isCustom ? (
                    <div className="flex gap-1">
                      <Input
                        value={fields[key].customVal}
                        onChange={(e) => handleCustomChange(key, e.target.value)}
                        placeholder="직접 입력..."
                        className="flex-1 font-mono text-xs"
                        autoFocus
                      />
                      {/* 선택 모드로 되돌아가기 */}
                      <button
                        type="button"
                        onClick={() => resetToSelect(key)}
                        className="p-2 rounded border border-border-subtle text-text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
                        title="목록에서 선택"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Select
                      value={fields[key].selectVal}
                      onValueChange={(v) => handleSelectChange(key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_SENTINEL} className="text-accent-green font-mono">
                          직접 입력...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs font-mono text-red-400 border border-red-900 rounded px-3 py-2 bg-red-950/30">
              ✗ {error}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={loading}
              disabled={!isValid}
            >
              분석 시작 →
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
