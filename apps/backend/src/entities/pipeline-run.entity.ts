import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { PipelinePhase, PipelineStatus } from './enums';

@Entity('pipeline_runs')
@Index(['projectId', 'startedAt'])
export class PipelineRun {
  // !: TypeORM이 DB에서 값을 채워주므로 TypeScript의 strictPropertyInitialization 경고를 억제
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'enum', enum: PipelinePhase })
  phase!: PipelinePhase;

  @Column({ type: 'enum', enum: PipelineStatus })
  status!: PipelineStatus;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @ManyToOne(() => Project, (project) => project.pipelineRuns)
  project!: Project;

  @OneToMany(() => Task, (task) => task.pipelineRun)
  tasks!: Task[];
}
