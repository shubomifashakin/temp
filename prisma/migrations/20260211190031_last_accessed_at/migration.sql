/*
  Warnings:

  - You are about to drop the column `last_accesed_at` on the `Files` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Files" DROP COLUMN "last_accesed_at",
ADD COLUMN     "last_accessed_at" TIMESTAMP(3);
