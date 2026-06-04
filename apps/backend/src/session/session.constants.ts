// SessionModule 내부 DI 토큰 — SessionService와 SessionModule에서만 사용.
// BullMQ와 분리된 ioredis 커넥션을 주입하기 위한 식별자
export const SESSION_REDIS = 'SESSION_REDIS';
