import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity';

@Entity('analysis_documents')
// Prisma의 @@index([projectId, version(sort: Desc)])에 대응
@Index(['projectId', 'version'])
export class AnalysisDocument {
  // !: TypeORM이 DB에서 값을 채워주므로 TypeScript의 strictPropertyInitialization 경고를 억제
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'text' })
  erd!: string;

  @Column({ name: 'api_spec', type: 'text' })
  apiSpec!: string;

  @Column({ type: 'text' })
  architecture!: string;

  @Column({ name: 'user_feedback', type: 'text', nullable: true })
  userFeedback!: string | null;

  // JSONB: Phase 3 코드 생성 시 [{path, role, dependencies}] 배열로 Claude에 주입됨
  @Column({ name: 'directory_structure', type: 'jsonb' })
  directoryStructure!: Record<string, unknown>[];

  // Phase 1 시 ui-ux-skill 검색 결과. 없으면 null, Phase 3 Frontend에 주입됨
  @Column({ name: 'design_system', type: 'text', nullable: true })
  designSystem!: string | null;

  // Phase 1 결과를 사용자가 확정하면 true로 갱신. Phase 2는 isConfirmed=true인 최신 문서만 사용
  @Column({ name: 'is_confirmed', default: false })
  isConfirmed!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Project, (project) => project.analysisDocuments)
  project!: Project;
}
