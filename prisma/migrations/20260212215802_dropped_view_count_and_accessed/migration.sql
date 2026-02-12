/*
  Warnings:

  - You are about to drop the column `last_accessed_at` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `view_count` on the `File` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "File" DROP COLUMN "last_accessed_at",
DROP COLUMN "view_count";
