// 백엔드 API 응답 타입 정의 (apps/backend/src/entities/, sse.types.ts 기반)

export type ProjectStatus =
  | 'CREATED'
  | 'ANALYZING'
  | 'AWAITING_REVIEW'
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED'

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED'
export type TaskType = 'BACKEND' | 'FRONTEND'
export type PipelinePhase = 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4'
export type PipelineStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface TechStack {
  frontend?: string
  backend?: string
  database?: string
}

export interface Project {
  id: string
  name: string
  requirements: string
  techStack: TechStack
  status: ProjectStatus
  githubRepoUrl: string | null
  githubRepoName: string | null
  createdAt: string
}

export interface AnalysisDocument {
  id: string
  projectId: string
  version: number
  erd: string
  apiSpec: string
  architecture: string
  isConfirmed: boolean
  createdAt: string
}

export interface Task {
  id: string
  name: string
  description: string
  type: TaskType
  orderIndex: number
  status: TaskStatus
}

export interface FileNode {
  name: string
  path: string
  children?: FileNode[]
}

export interface FileContent {
  path: string
  content: string
}

// SSE 이벤트 타입
export type SseEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'task_started'
  | 'task_completed'
  | 'pipeline_completed'
  | 'pipeline_failed'

export interface SseEvent {
  type: SseEventType
  phase?: PipelinePhase
  taskId?: string
  taskName?: string
  analysisDocumentId?: string  // phase_completed PHASE_1 시
  pipelineRunId?: string       // phase_completed PHASE_2 시
  githubRepoUrl?: string       // pipeline_completed 시
  message?: string             // pipeline_failed 시
  timestamp: string
}

// API 요청/응답 타입
export interface CreateSessionRequest {
  githubToken: string
  claudeApiKey: string
  isPrivate: boolean
}

export interface CreateSessionResponse {
  sessionId: string
}

export interface CreateProjectRequest {
  name: string
  requirements: string
  techStack: TechStack
}

export interface PipelineResponse {
  pipelineId: string
  phase: PipelinePhase
  status: PipelineStatus
}
