// SSE로 클라이언트에 전달하는 이벤트 타입 정의.
// Worker(PipelineWorker/TaskWorker)가 파이프라인 진행 상황을 publish하면 SSE 스트림으로 전달된다.

// 클라이언트로 전달되는 이벤트 종류.
// - phase_started / phase_completed: Phase 1~4의 시작/완료
// - task_started / task_completed: Phase 3의 개별 Task 시작/완료
// - pipeline_completed: 전체 파이프라인 성공 (GitHub push 완료 포함)
// - pipeline_failed: 어느 단계에서든 실패
export type SseEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'task_started'
  | 'task_completed'
  | 'pipeline_completed'
  | 'pipeline_failed';

// SSE 이벤트 페이로드. 이벤트 종류에 따라 일부 필드만 채워진다.
export interface SseEvent {
  type: SseEventType;
  phase?: string; // PipelinePhase enum 값 (phase_started/phase_completed 시)
  taskId?: string; // 처리 중인 Task id (task_started/task_completed 시)
  taskName?: string; // Task 이름 (task_started/task_completed 시)
  analysisDocumentId?: string; // 생성된 분석 문서 id (phase_completed PHASE_1 시) — 클라이언트가 문서 조회에 사용
  pipelineRunId?: string; // PipelineRun id (phase_completed PHASE_2 시) — 클라이언트가 태스크 목록 조회에 사용
  githubRepoUrl?: string; // 생성 코드가 push된 GitHub repo URL (pipeline_completed 시)
  message?: string; // 에러 메시지 (pipeline_failed 시)
  timestamp: string; // 이벤트 발생 시각 (ISO 8601)
}
