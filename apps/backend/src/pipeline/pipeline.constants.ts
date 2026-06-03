export const PIPELINE_QUEUE = 'pipeline';

// Task 단위 코드 생성 잡을 처리하는 별도 큐
// concurrency: 1로 직렬 처리해 orderIndex 순서를 보장한다
export const TASK_QUEUE = 'task';

export enum PipelineJobName {
  START = 'pipeline.start',
  FEEDBACK = 'pipeline.feedback',
  CONFIRM = 'pipeline.confirm',
}

export enum TaskJobName {
  RUN = 'task.run',
}
