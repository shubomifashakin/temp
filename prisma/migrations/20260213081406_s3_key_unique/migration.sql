/*
  Warnings:

  - A unique constraint covering the columns `[s3_key]` on the table `File` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "File_s3_key_key" ON "File"("s3_key");
