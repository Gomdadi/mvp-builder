// Prisma schema의 enum 블록을 TypeScript enum으로 옮긴 파일.
// @prisma/client 제거 후 서비스들이 이 파일에서 enum을 import한다.

export enum ProjectStatus {
  CREATED = 'CREATED',
  ANALYZING = 'ANALYZING',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum PipelinePhase {
  PHASE_1 = 'PHASE_1',
  PHASE_2 = 'PHASE_2',
  PHASE_3 = 'PHASE_3',
  PHASE_4 = 'PHASE_4', // 종합 sandbox 검증 단계
}

export enum PipelineStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum TaskType {
  BACKEND = 'BACKEND',
  FRONTEND = 'FRONTEND',
}
