import { Body, Controller, Post } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';

// @Controller('session'): 이 클래스의 라우트는 /v1/session으로 시작 (global prefix v1 포함)
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  // POST /v1/session — GitHub PAT + Claude API Key + isPrivate를 받아 Redis에 임시 저장.
  // 응답으로 sessionId를 반환하며, 클라이언트는 이후 파이프라인 요청 시 X-Session-Id 헤더로 전달한다.
  @Post()
  async create(@Body() body: CreateSessionDto): Promise<{ sessionId: string }> {
    const sessionId = await this.sessionService.createSession({
      githubToken: body.githubToken,
      claudeApiKey: body.claudeApiKey,
      isPrivate: body.isPrivate,
    });
    return { sessionId };
  }
}
