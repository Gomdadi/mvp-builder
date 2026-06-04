import { MigrationInterface, QueryRunner } from 'typeorm';

// pipeline_runs.phase 컬럼의 PostgreSQL enum에 PHASE_4 값을 추가한다.
// ALTER TYPE ... ADD VALUE는 트랜잭션 내에서 실행 불가 — executeSimpleQuery로 트랜잭션 밖에서 실행
export class AddPhase4ToEnum1749013000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // IF NOT EXISTS는 PostgreSQL 9.6+에서 지원 — 이미 값이 있으면 에러 없이 skip
    // DB의 실제 enum 타입명은 "PipelinePhase" (따옴표 포함, 대소문자 구분)
    await queryRunner.query(
      `ALTER TYPE "PipelinePhase" ADD VALUE IF NOT EXISTS 'PHASE_4'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL은 enum 값 제거를 직접 지원하지 않음.
    // 롤백이 필요하면 enum을 재생성해야 하므로 여기서는 안내 메시지만 남김
    console.warn(
      'Rollback of AddPhase4ToEnum: PostgreSQL does not support removing enum values. ' +
      'Manual intervention required if PHASE_4 removal is needed.',
    );
  }
}
