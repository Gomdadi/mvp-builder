import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEV_PROJECT_ID = '00000000-0000-0000-0000-000000000002';

async function main() {
  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      githubId: 'dev-user',
      githubLogin: 'dev-user',
    },
  });

  await prisma.project.upsert({
    where: { id: DEV_PROJECT_ID },
    update: {},
    create: {
      id: DEV_PROJECT_ID,
      userId: DEV_USER_ID,
      name: 'Dev Test Project',
      requirements: 'Sprint 1 개발 테스트용 프로젝트',
      techStack: { frontend: 'Next.js', backend: 'NestJS', database: 'PostgreSQL' },
      status: 'CREATED',
    },
  });

  console.log(`Dev user seeded:    ${DEV_USER_ID}`);
  console.log(`Dev project seeded: ${DEV_PROJECT_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
