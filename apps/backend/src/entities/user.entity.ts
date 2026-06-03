import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Project } from './project.entity';

// @Entity('users'): DB 테이블 이름을 'users'로 지정 (Prisma의 @@map("users")와 동일)
@Entity('users')
export class User {
  // !: TypeORM이 DB에서 값을 채워주므로 TypeScript의 strictPropertyInitialization 경고를 억제
  // (definite assignment assertion — 런타임에는 반드시 값이 있음을 보장)

  // @PrimaryGeneratedColumn('uuid'): gen_random_uuid()로 UUID를 자동 생성해 PK로 사용
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // @Column({ unique: true, name: 'github_id' }): DB 컬럼명을 snake_case로 지정 (camelCase → snake_case 매핑)
  @Column({ unique: true, name: 'github_id', length: 100 })
  githubId!: string;

  @Column({ name: 'github_login', length: 100 })
  githubLogin!: string;

  // nullable: true — Prisma schema의 String? (nullable) 필드에 대응
  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'claude_api_key', nullable: true })
  claudeApiKey!: string | null;

  // @CreateDateColumn: INSERT 시 현재 시각을 자동으로 저장 (Prisma의 @default(now())와 동일)
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // @UpdateDateColumn: UPDATE 시 현재 시각을 자동으로 갱신 (Prisma의 @updatedAt과 동일)
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // @OneToMany: User 1명이 여러 Project를 가질 수 있음
  // () => Project: 순환 참조 방지를 위해 함수로 감싼 지연 로딩 패턴
  // (project) => project.user: Project 엔티티에서 이 관계를 가리키는 프로퍼티 지정
  @OneToMany(() => Project, (project) => project.user)
  projects!: Project[];
}
