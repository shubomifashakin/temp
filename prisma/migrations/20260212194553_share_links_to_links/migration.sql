/*
  Warnings:

  - You are about to drop the `ShareLinks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ShareLinks" DROP CONSTRAINT "ShareLinks_file_id_fkey";

-- DropTable
DROP TABLE "ShareLinks";

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(100) NOT NULL,
    "file_id" TEXT NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "password" TEXT,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Link_id_file_id_key" ON "Link"("id", "file_id");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "Files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
