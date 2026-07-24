-- AlterEnum
ALTER TYPE "FileStatus" ADD VALUE 'unscanned';

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "multipart_upload_id" TEXT,
ALTER COLUMN "size" SET DATA TYPE BIGINT;
