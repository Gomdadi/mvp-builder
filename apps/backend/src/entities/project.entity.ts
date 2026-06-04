import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AnalysisDocument } from './analysis-document.entity';
import { PipelineRun } from './pipeline-run.entity';
import { Task } from './task.entity';
import { ProjectStatus } from './enums';

@Entity('projects')
// @Index: DB 인덱스 생성. 인증 제거로 userId 인덱스는 삭제하고 status 인덱스만 유지
@Index(['status'])
export class Project {
  // !: TypeORM이 DB에서 값을 채워주므로 TypeScript의 strictPropertyInitialization 경고를 억제
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ nullable: true, type: 'text' })
  description!: string | null;

  @Column({ type: 'text' })
  requirements!: string;

  // type: 'jsonb' — JSON 데이터를 PostgreSQL JSONB 타입으로 저장 (Prisma의 Json 타입에 대응)
  @Column({ name: 'tech_stack', type: 'jsonb' })
  techStack!: Record<string, unknown>;

  // type: 'enum' — PostgreSQL enum 타입. enum: ProjectStatus로 허용 값을 제한
  // default: ProjectStatus.CREATED — INSERT 시 기본값
  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.CREATED })
  status!: ProjectStatus;

  @Column({ name: 'github_repo_url', type: 'text', nullable: true })
  githubRepoUrl!: string | null;

  @Column({ name: 'github_repo_name', type: 'varchar', length: 200, nullable: true })
  githubRepoName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AnalysisDocument, (doc) => doc.project)
  analysisDocuments!: AnalysisDocument[];

  @OneToMany(() => PipelineRun, (run) => run.project)
  pipelineRuns!: PipelineRun[];

  @OneToMany(() => Task, (task) => task.project)
  tasks!: Task[];
}
