// SseModule 내부 DI 토큰 — SseService와 SseModule에서만 사용.
// SSE 실시간 스트리밍을 위해 Redis pub/sub 전용 ioredis 커넥션 2개를 주입하기 위한 식별자.
// SUBSCRIBE 모드에 진입한 ioredis 커넥션은 다른 명령을 보낼 수 없으므로 PUBLISH 전용과 SUBSCRIBE 전용을 분리한다.
export const SSE_REDIS_PUB = 'SSE_REDIS_PUB'; // PUBLISH 전용 커넥션
export const SSE_REDIS_SUB = 'SSE_REDIS_SUB'; // SUBSCRIBE 전용 커넥션
