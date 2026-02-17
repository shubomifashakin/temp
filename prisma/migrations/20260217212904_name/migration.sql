/*
  Warnings:

  - A unique constraint covering the columns `[name,user_id]` on the table `File` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "File" ADD COLUMN     "name" VARCHAR(50) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "File_name_user_id_key" ON "File"("name", "user_id");
