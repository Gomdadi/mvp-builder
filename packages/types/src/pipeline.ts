export type PipelinePhase = 'PHASE_1' | 'PHASE_2' | 'PHASE_3';

export type PipelineStatus =
  | 'IDLE'
  | 'ANALYZING'
  | 'AWAITING_REVIEW'
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED';

export type SseEventType =
  | 'phase_started'
  | 'progress'
  | 'phase_completed'
  | 'task_started'
  | 'task_completed'
  | 'pipeline_completed'
  | 'pipeline_failed';

export interface SseEvent {
  type: SseEventType;
  phase?: PipelinePhase;
  message?: string;
  taskId?: number;
  repositoryUrl?: string;
}
