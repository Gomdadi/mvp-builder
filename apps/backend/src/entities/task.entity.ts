import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Project } from './project.entity';
import { PipelineRun } from './pipeline-run.entity';
import { TaskStatus, TaskType } from './enums';

@Entity('tasks')
// Prisma의 @@index([pipelineRunId, orderIndex])에 대응. Phase 3가 순서대로 태스크를 처리할 때 사용
@Index(['pipelineRunId', 'orderIndex'])
export class Task {
  // !: TypeORM이 DB에서 값을 채워주므로 TypeScript의 strictPropertyInitialization 경고를 억제
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'pipeline_run_id', type: 'uuid' })
  pipelineRunId!: string;

  @Column({ length: 300 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  // Phase 2에서 Claude가 반환한 실행 순서. 낮은 번호부터 순서대로 처리됨
  @Column({ name: 'order_index' })
  orderIndex!: number;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status!: TaskStatus;

  @Column({ type: 'enum', enum: TaskType, default: TaskType.BACKEND })
  type!: TaskType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Project, (project) => project.tasks)
  project!: Project;

  @ManyToOne(() => PipelineRun, (run) => run.tasks)
  pipelineRun!: PipelineRun;
}
