/**
 * E2E 백엔드 파이프라인 검증 스크립트.
 *
 * 목적:
 *   로컬 Docker 환경(Postgres + Redis + LocalStack)에서 실행 중인 백엔드 서버를 대상으로
 *   파이프라인 Phase 1→2→3→4 전체 흐름을 자동 실행하고, SSE 이벤트 흐름을 로그로 수집한다.
 *   코드 생성 결과(S3, GitHub repo)는 사용자가 직접 확인하며, 이 스크립트는 흐름 자동화와 로깅만 담당한다.
 *
 * 실행 흐름(시나리오 1개당):
 *   1. POST /session        → sessionId 발급 (GitHub PAT + Claude API Key를 Redis 세션에 저장)
 *   2. POST /projects       → projectId 생성
 *   3. POST /pipeline/:projectId/start    → 파이프라인 시작 (Phase 1 비동기 실행)
 *   4. SSE 대기: phase_completed PHASE_1  → analysisDocumentId 획득
 *   5. (피드백 있으면) POST /pipeline/:projectId/feedback → SSE phase_completed PHASE_1 재대기
 *   6. POST /pipeline/:projectId/confirm  → Phase 2/3/4 실행
 *   7. SSE 대기: pipeline_completed | pipeline_failed → 최종 결과
 *   8. 로그 파일 저장
 *
 * 인증/설정값은 apps/backend/.env.e2e 에서 로드한다(GITHUB_TOKEN, CLAUDE_API_KEY, E2E_BASE_URL).
 *
 * 실행:
 *   npm run e2e                   # 전체 시나리오 순차 실행
 *   npm run e2e -- --scenario=S1  # 특정 시나리오만 실행
 *
 * 외부 패키지 의존성 없음 — SSE는 Node 18+ 내장 fetch로 직접 파싱한다.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env.e2e 로드 — 스크립트 위치(scripts/) 기준 상위 디렉토리(apps/backend/)의 .env.e2e를 읽는다.
// 이렇게 절대 경로로 지정해야 cwd가 어디든 동일하게 동작한다.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.e2e') });

// 백엔드 API base URL. .env.e2e의 E2E_BASE_URL이 있으면 사용, 없으면 로컬 기본값.
// main.ts에서 setGlobalPrefix('v1') + 기본 포트 3001 이므로 기본값에 /v1 prefix 포함.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3001/v1';

// 세션 생성에 필요한 인증 정보 — .env.e2e에서 로드.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

// e2e-scenarios.json 한 항목의 구조.
interface Scenario {
  id: string; // 시나리오 식별자 (S1~S4), 로그 파일명·CLI 인수에 사용
  name: string; // 사람이 읽는 시나리오 설명
  projectName: string; // 생성할 프로젝트 이름 (POST /projects의 name)
  requirements: string; // Phase 1 분석 입력 요구사항
  techStack: Record<string, unknown>; // 기술 스택 — jsonb로 저장됨
  feedback: string | null; // 피드백 텍스트 — null이면 피드백 단계 생략
  isPrivate: boolean; // 생성할 GitHub repo의 공개 여부
}

// 백엔드 SseService가 publish하는 이벤트 구조 (src/sse/sse.types.ts와 동일 형태).
// 필요한 필드만 옵셔널로 선언 — 이벤트 type에 따라 채워지는 필드가 다르다.
interface SseEvent {
  type: string; // phase_started | phase_completed | task_* | pipeline_completed | pipeline_failed
  phase?: string; // PipelinePhase enum 값 (phase_started/phase_completed 시): PHASE_1~PHASE_4
  analysisDocumentId?: string; // 생성된 분석 문서 id (phase_completed PHASE_1 시)
  pipelineRunId?: string; // PipelineRun id (phase_completed PHASE_2 시)
  taskId?: string; // task_* 이벤트의 태스크 id
  taskName?: string; // task_* 이벤트의 태스크 이름
  githubRepoUrl?: string; // 생성 코드가 push된 GitHub repo URL (pipeline_completed 시)
  message?: string; // 에러 메시지 (pipeline_failed 시)
  timestamp: string; // 이벤트 발생 시각
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger — 콘솔 출력과 파일 저장을 함께 수행한다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 시나리오 실행 동안 발생한 모든 로그 라인을 메모리에 누적했다가,
 * 시나리오 종료 시 logs/ 디렉토리에 파일로 저장한다.
 * 동시에 각 로그는 실시간으로 콘솔에도 출력한다.
 */
class Logger {
  // 누적된 로그 라인. saveToFile 시점에 한 번에 파일로 기록한다.
  private lines: string[] = [];

  // 공통 로그 기록 — ISO 타임스탬프와 레벨을 prefix로 붙여 라인을 만든다.
  log(level: 'INFO' | 'ERROR', message: string): void {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    this.lines.push(line);
    console.log(line);
  }

  // 정보성 로그.
  info(msg: string): void {
    this.log('INFO', msg);
  }

  // 에러성 로그.
  error(msg: string): void {
    this.log('ERROR', msg);
  }

  /**
   * 누적된 로그를 logs/e2e-{scenarioId}-{timestamp}.log 파일로 저장한다.
   * logs/ 디렉토리는 없으면 자동 생성(recursive)한다 — 미리 만들어 둘 필요 없음.
   */
  saveToFile(scenarioId: string): void {
    const filename = `logs/e2e-${scenarioId}-${Date.now()}.log`;
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(filename, this.lines.join('\n') + '\n');
    console.log(`로그 저장: ${filename}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP / SSE 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON body로 POST 요청을 보내고 응답 JSON을 반환한다.
 * sessionId가 주어지면 x-session-id 헤더에 실어 보낸다(파이프라인 엔드포인트가 요구).
 * 2xx가 아니면 상태코드와 응답 본문을 포함한 에러를 throw한다.
 */
async function post(path: string, body: unknown, sessionId?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['x-session-id'] = sessionId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`POST ${path} 실패: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * GET 요청을 보내고 응답 JSON을 반환한다.
 * 2xx가 아니면 에러를 throw한다.
 */
async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} 실패: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * 지정한 projectId의 SSE 스트림(/pipeline/:projectId/stream)에 연결해,
 * targetTypes(및 선택적 targetPhase)에 매칭되는 첫 이벤트가 올 때까지 대기한다.
 *
 * - Node 18+ 내장 fetch의 ReadableStream을 직접 읽어 SSE 프레임(\n\n 구분)을 파싱한다.
 * - 각 프레임의 `data: ` 라인을 JSON 파싱해 SseEvent로 변환하고, 수신한 모든 이벤트를 로깅한다.
 * - 매칭 이벤트 수신 시 reader를 취소하고 해당 이벤트로 resolve한다.
 * - timeoutMs 동안 매칭 이벤트가 없으면 reject(기본 10분 — Phase 3 코드 생성이 오래 걸림).
 *
 * 주의: 각 호출이 새 SSE 커넥션을 연다. BullMQ Worker가 비동기로 처리하고
 *       SseService가 Redis pub/sub으로 이벤트를 보내므로, 재연결해도 이후 이벤트를 받을 수 있다.
 */
async function waitForSseEvent(
  projectId: string,
  targetTypes: string[], // 예: ['phase_completed'] 또는 ['pipeline_completed', 'pipeline_failed']
  targetPhase: string | undefined, // phase 매칭이 필요할 때만 지정 (예: 'PHASE_1')
  logger: Logger,
  timeoutMs = 600_000, // 10분 — Phase 3 코드 생성 대기 여유
): Promise<SseEvent> {
  const url = `${BASE_URL}/pipeline/${projectId}/stream`;
  const res = await fetch(url);
  // res.body는 SSE 스트림. null이면 연결 자체가 실패한 것이므로 명시적으로 에러를 던진다.
  if (!res.body) {
    throw new Error(`SSE 연결 실패 — body 없음: ${url}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // 청크 경계가 SSE 프레임 경계와 일치하지 않을 수 있어, 미완성 프레임을 buffer에 보관한다.
  let buffer = '';

  return new Promise<SseEvent>((resolve, reject) => {
    // 타임아웃 — 시간 내 매칭 이벤트가 없으면 reader를 끊고 reject.
    const timer = setTimeout(() => {
      void reader.cancel();
      reject(new Error(`SSE 타임아웃 ${timeoutMs}ms — projectId=${projectId}`));
    }, timeoutMs);

    // 스트림을 끝까지(또는 매칭 시점까지) 읽는 비동기 루프.
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break; // 서버가 스트림을 종료함

          // 누적 후 \n\n(SSE 프레임 구분자)으로 분리. 마지막 조각은 미완성일 수 있어 buffer에 남긴다.
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            // SSE 프레임에서 실제 페이로드를 담은 `data: ` 라인을 찾는다.
            const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;

            const event: SseEvent = JSON.parse(dataLine.slice(6)); // 'data: ' 6글자 제거 후 JSON 파싱
            logger.info(`SSE 수신 — ${JSON.stringify(event)}`);

            // type 매칭 + (targetPhase가 지정된 경우) phase 매칭이면 대기 완료.
            // pipeline_failed는 phase 필드가 없으므로 targetPhase 조건을 적용하지 않는다.
            const phaseMatches = !targetPhase || event.phase === targetPhase || event.type === 'pipeline_failed';
            if (targetTypes.includes(event.type) && phaseMatches) {
              clearTimeout(timer);
              void reader.cancel();
              resolve(event);
              return;
            }
          }
        }
        // 매칭 이벤트 없이 스트림이 끝난 경우.
        clearTimeout(timer);
        reject(new Error(`SSE 스트림 종료 (이벤트 미수신) — projectId=${projectId}`));
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    })();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 결과 수집
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 파이프라인 완료 후 Project CRUD API를 호출해 생성 결과를 수집하고
 * logs/e2e-result-{scenarioId}-{timestamp}.json 으로 저장한다.
 *
 * 수집 항목:
 *   - GET /projects/:id            → 프로젝트 기본 정보
 *   - GET /analysis-documents/:id  → Phase 1 분석 문서 (ERD, API 스펙, 아키텍처, 디렉토리 구조)
 *   - GET /pipeline-runs/:id/tasks → Phase 2 분해 태스크 목록 + 각 태스크 상태
 *   - GET /projects/:id/files      → Phase 3 생성 파일 트리 (S3 키 목록)
 *
 * API 호출이 실패해도 에러를 기록하고 수집 가능한 항목만 저장한다 (throw하지 않음).
 */
async function collectAndSaveResults(
  ids: { projectId: string; analysisDocumentId: string; pipelineRunId: string },
  scenarioId: string,
  logger: Logger,
): Promise<void> {
  const { projectId, analysisDocumentId, pipelineRunId } = ids;
  const result: Record<string, unknown> = { collectedAt: new Date().toISOString(), projectId };

  // 각 API를 독립적으로 호출 — 하나 실패해도 나머지는 수집한다.
  const calls: Array<{ key: string; path: string }> = [
    { key: 'project',          path: `/projects/${projectId}` },
    { key: 'analysisDocument', path: `/analysis-documents/${analysisDocumentId}` },
    { key: 'tasks',            path: `/pipeline-runs/${pipelineRunId}/tasks` },
    { key: 'files',            path: `/projects/${projectId}/files` },
  ];

  for (const { key, path } of calls) {
    try {
      result[key] = await get(path);
      logger.info(`   [결과수집] ${key} 조회 완료`);
    } catch (e) {
      logger.error(`   [결과수집] ${key} 조회 실패: ${(e as Error).message}`);
      result[key] = { error: (e as Error).message };
    }
  }

  // logs/ 디렉토리에 JSON 저장
  fs.mkdirSync('logs', { recursive: true });
  const filename = `logs/e2e-result-${scenarioId}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2) + '\n');
  logger.info(`결과 저장: ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 시나리오 실행
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 단일 시나리오의 전체 파이프라인 흐름을 실행한다.
 * 각 단계의 진행 상황과 SSE 이벤트를 Logger에 기록하고, 마지막에 로그 파일을 저장한다.
 * 단계 중 예외가 발생해도 finally에서 로그를 저장하므로 실패 원인이 파일에 남는다.
 */
async function runScenario(scenario: Scenario): Promise<void> {
  const logger = new Logger();
  logger.info(`===== 시나리오 시작: ${scenario.id} — ${scenario.name} =====`);

  try {
    // 1. 세션 생성 — GitHub PAT + Claude API Key + isPrivate를 Redis에 저장하고 sessionId를 받는다.
    logger.info('1. POST /session — 세션 생성');
    const session = await post('/session', {
      githubToken: GITHUB_TOKEN,
      claudeApiKey: CLAUDE_API_KEY,
      isPrivate: scenario.isPrivate,
    });
    const sessionId: string = session.sessionId;
    logger.info(`   sessionId=${sessionId}`);

    // 2. 프로젝트 생성 — 이름/요구사항/기술스택을 저장하고 projectId를 받는다.
    logger.info('2. POST /projects — 프로젝트 생성');
    const project = await post('/projects', {
      name: scenario.projectName,
      requirements: scenario.requirements,
      techStack: scenario.techStack,
    });
    const projectId: string = project.id;
    logger.info(`   projectId=${projectId}`);

    // 3. 파이프라인 시작 — Phase 1을 비동기로 실행한다. 응답은 즉시 반환(202).
    logger.info('3. POST /pipeline/:projectId/start — 파이프라인 시작');
    const started = await post(`/pipeline/${projectId}/start`, {}, sessionId);
    logger.info(`   start 응답=${JSON.stringify(started)}`);

    // 4. Phase 1 완료 대기 — phase_completed PHASE_1 이벤트에서 analysisDocumentId를 획득한다.
    logger.info('4. SSE 대기 — phase_completed PHASE_1');
    let phase1Event = await waitForSseEvent(projectId, ['phase_completed', 'pipeline_failed'], 'PHASE_1', logger);
    if (phase1Event.type === 'pipeline_failed') {
      throw new Error(`Phase 1 실패: ${phase1Event.message}`);
    }
    let analysisDocumentId = phase1Event.analysisDocumentId;
    logger.info(`   analysisDocumentId=${analysisDocumentId}`);

    // 5. 피드백 단계 — feedback이 있으면 Phase 1을 재실행하고, 새 analysisDocumentId를 다시 받는다.
    //    feedback 엔드포인트는 { analysisDocumentId, feedbackText }를 요구하므로 직전 문서 id를 함께 전달한다.
    if (scenario.feedback) {
      logger.info('5. POST /pipeline/:projectId/feedback — 피드백 제출 (Phase 1 재실행)');
      const feedbackRes = await post(
        `/pipeline/${projectId}/feedback`,
        { analysisDocumentId, feedbackText: scenario.feedback },
        sessionId,
      );
      logger.info(`   feedback 응답=${JSON.stringify(feedbackRes)}`);

      // 새 SSE 커넥션으로 Phase 1 재완료를 대기한다.
      logger.info('   SSE 재대기 — phase_completed PHASE_1');
      phase1Event = await waitForSseEvent(projectId, ['phase_completed', 'pipeline_failed'], 'PHASE_1', logger);
      if (phase1Event.type === 'pipeline_failed') {
        throw new Error(`Phase 1(피드백) 실패: ${phase1Event.message}`);
      }
      analysisDocumentId = phase1Event.analysisDocumentId;
      logger.info(`   재생성 analysisDocumentId=${analysisDocumentId}`);
    } else {
      logger.info('5. 피드백 없음 — 단계 생략');
    }

    // 6. 분석 문서 확정 — analysisDocumentId를 확정하면 Phase 2/3/4가 순차 실행된다.
    logger.info('6. POST /pipeline/:projectId/confirm — 분석 문서 확정');
    const confirmed = await post(
      `/pipeline/${projectId}/confirm`,
      { analysisDocumentId },
      sessionId,
    );
    // confirm 응답에서 pipelineRunId 획득 — Phase 3/4 태스크 조회에 사용한다.
    const pipelineRunId: string = confirmed.pipelineRunId;
    logger.info(`   confirm 응답=${JSON.stringify(confirmed)}`);

    // 7. 최종 결과 대기 — pipeline_completed(성공) 또는 pipeline_failed(실패) 둘 중 하나가 최종 이벤트.
    logger.info('7. SSE 대기 — pipeline_completed | pipeline_failed');
    const finalEvent = await waitForSseEvent(
      projectId,
      ['pipeline_completed', 'pipeline_failed'],
      undefined,
      logger,
    );

    if (finalEvent.type === 'pipeline_completed') {
      logger.info(`✅ 파이프라인 성공 — githubRepoUrl=${finalEvent.githubRepoUrl}`);
    } else {
      logger.error(`❌ 파이프라인 실패 — message=${finalEvent.message}`);
    }

    // 8. 결과 수집 — Project CRUD API로 생성 결과를 조회해 별도 JSON 파일에 저장한다.
    //    파이프라인 성공/실패 여부와 무관하게 현재까지 생성된 결과를 수집한다.
    logger.info('8. 결과 수집 — Project CRUD API 호출');
    await collectAndSaveResults(
      { projectId, analysisDocumentId: analysisDocumentId!, pipelineRunId },
      scenario.id,
      logger,
    );

    logger.info(`===== 시나리오 종료: ${scenario.id} =====`);
  } catch (e) {
    // 어느 단계에서 실패하든 원인을 로그에 남긴다 (finally의 saveToFile로 파일에도 기록됨).
    logger.error(`시나리오 실행 중 예외: ${(e as Error).message}`);
  } finally {
    // 성공/실패와 무관하게 로그 파일을 저장한다.
    logger.saveToFile(scenario.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CLI 인수를 파싱해 전체 또는 특정 시나리오를 순차 실행한다.
 *   --scenario=S1 형태의 인수가 있으면 해당 시나리오만, 없으면 전체를 순서대로 실행한다.
 * 시나리오는 e2e-scenarios.json에서 로드한다(코드 수정 없이 시나리오 추가/변경 가능).
 */
async function main(): Promise<void> {
  // 시나리오 정의 로드 — 스크립트와 같은 디렉토리의 e2e-scenarios.json.
  const scenariosPath = path.resolve(__dirname, 'e2e-scenarios.json');
  const scenarios: Scenario[] = JSON.parse(fs.readFileSync(scenariosPath, 'utf-8'));

  // --scenario=XX 인수 파싱.
  const arg = process.argv.find((a) => a.startsWith('--scenario='));
  const onlyId = arg?.split('=')[1];

  // 실행 대상 결정 — 특정 id가 주어지면 필터링, 아니면 전체.
  const targets = onlyId ? scenarios.filter((s) => s.id === onlyId) : scenarios;

  if (targets.length === 0) {
    console.error(`실행할 시나리오가 없습니다. --scenario=${onlyId ?? ''} 에 해당하는 항목이 없습니다.`);
    process.exit(1);
  }

  // 인증 정보 누락 시 조기 경고 — 세션 생성이 실패할 수 있음을 알린다.
  if (!GITHUB_TOKEN || !CLAUDE_API_KEY) {
    console.warn('경고: GITHUB_TOKEN 또는 CLAUDE_API_KEY가 비어 있습니다. .env.e2e를 확인하세요.');
  }

  console.log(`실행 대상 시나리오: ${targets.map((s) => s.id).join(', ')}`);
  console.log(`BASE_URL: ${BASE_URL}`);

  // 시나리오를 순차 실행한다(병렬 실행 시 SSE/큐 처리가 뒤섞이므로 순차로 처리).
  for (const scenario of targets) {
    await runScenario(scenario);
  }
}

// 스크립트 진입 — 최상위 예외는 비정상 종료 코드로 마감한다.
main().catch((e) => {
  console.error('E2E 러너 치명적 오류:', e);
  process.exit(1);
});
