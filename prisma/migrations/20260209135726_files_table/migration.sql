-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('safe', 'unsafe', 'pending');

-- CreateTable
CREATE TABLE "Files" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(100) NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "s3_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL,
    "last_accesed_at" TIMESTAMP(3) NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'pending',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "Files_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Files" ADD CONSTRAINT "Files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
