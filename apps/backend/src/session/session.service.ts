import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { SESSION_REDIS } from './session.constants';

// 세션에 저장할 데이터 형태.
// githubToken/claudeApiKey/isPrivate는 인증 없는 구조에서 요청마다 받아 임시 보관하는 민감 정보.
export interface SessionData {
  githubToken: string;
  claudeApiKey: string;
  isPrivate: boolean;
}

// 세션 키의 TTL(초) — 24시간 후 자동 만료되어 민감 정보가 영구 저장되지 않도록 한다
const SESSION_TTL_SECONDS = 86400;

// 세션 데이터를 Redis에 임시 저장/조회/삭제하는 서비스.
// BullMQ와 동일한 Redis 인스턴스를 쓰지만 별도 커넥션(SESSION_REDIS)으로 주입받아 직접 명령을 실행한다.
@Injectable()
export class SessionService {
  constructor(
    // SESSION_REDIS: SessionModule에서 useFactory로 생성한 ioredis 커넥션
    @Inject(SESSION_REDIS) private readonly redis: Redis,
  ) {}

  // 세션 생성 — UUID를 발급하고 JSON 직렬화한 데이터를 TTL과 함께 저장한다.
  // 반환값: 발급된 sessionId. 클라이언트는 이후 X-Session-Id 헤더로 이 값을 전달한다.
  async createSession(data: SessionData): Promise<string> {
    const sessionId = randomUUID();
    // SET key value EX seconds — TTL을 함께 지정해 만료 시 자동 삭제
    await this.redis.set(
      this.key(sessionId),
      JSON.stringify(data),
      'EX',
      SESSION_TTL_SECONDS,
    );
    return sessionId;
  }

  // 세션 조회 — 키가 없거나 만료됐으면 null을 반환한다.
  // sessionId가 비어있는 경우(헤더 미전달)도 null 반환 — 호출부에서 env 키 fallback 처리
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId) return null;
    const raw = await this.redis.get(this.key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  }

  // 세션 삭제 — 파이프라인 완료 후 민감 정보를 즉시 제거한다.
  async deleteSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    await this.redis.del(this.key(sessionId));
  }

  // 세션 키 네임스페이스 — Redis 키 충돌 방지를 위해 session: prefix를 붙인다
  private key(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
