/*
  Warnings:

  - The required column `share_id` was added to the `links` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "links" ADD COLUMN     "share_id" TEXT NOT NULL;
