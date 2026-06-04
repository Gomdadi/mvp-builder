import type {
  AnalysisDocument,
  CreateProjectRequest,
  CreateSessionRequest,
  CreateSessionResponse,
  FileContent,
  FileNode,
  PipelineResponse,
  Project,
  Task,
} from '@/types/api'

const SESSION_KEY = 'mvp_session_id'

export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function saveSessionId(id: string): void {
  localStorage.setItem(SESSION_KEY, id)
}

export function clearSessionId(): void {
  localStorage.removeItem(SESSION_KEY)
}

// X-Session-Id 헤더를 자동으로 포함하는 fetch 래퍼
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionId = getSessionId()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  }

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message ?? 'Unknown error')
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

// Session
export function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  return apiFetch('/v1/session', { method: 'POST', body: JSON.stringify(body) })
}

// Projects
export function createProject(body: CreateProjectRequest): Promise<Project> {
  return apiFetch('/v1/projects', { method: 'POST', body: JSON.stringify(body) })
}

export function getProject(id: string): Promise<Project> {
  return apiFetch(`/v1/projects/${id}`)
}

export function getProjectFiles(id: string): Promise<FileNode[]> {
  return apiFetch(`/v1/projects/${id}/files`)
}

export function getFileContent(projectId: string, filePath: string): Promise<FileContent> {
  return apiFetch(`/v1/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`)
}

// Pipeline
export function startPipeline(projectId: string): Promise<PipelineResponse> {
  return apiFetch(`/v1/pipeline/${projectId}/start`, { method: 'POST' })
}

export function confirmPipeline(
  projectId: string,
  analysisDocumentId: string,
): Promise<PipelineResponse> {
  return apiFetch(`/v1/pipeline/${projectId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ analysisDocumentId }),
  })
}

export function feedbackPipeline(
  projectId: string,
  analysisDocumentId: string,
  feedbackText: string,
): Promise<PipelineResponse> {
  return apiFetch(`/v1/pipeline/${projectId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ analysisDocumentId, feedbackText }),
  })
}

// Analysis Document
export function getAnalysisDocument(id: string): Promise<AnalysisDocument> {
  return apiFetch(`/v1/analysis-documents/${id}`)
}

// Pipeline Tasks
export function getTasksByPipelineRun(pipelineRunId: string): Promise<Task[]> {
  return apiFetch(`/v1/pipeline-runs/${pipelineRunId}/tasks`)
}
