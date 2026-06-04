import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// 브라우저 환경용 MSW Service Worker 설정
export const worker = setupWorker(...handlers)
