-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('BACKEND', 'FRONTEND');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'BACKEND';
