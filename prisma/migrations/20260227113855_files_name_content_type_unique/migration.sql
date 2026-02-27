/*
  Warnings:

  - A unique constraint covering the columns `[name,user_id,content_type]` on the table `files` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "files_name_user_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "files_name_user_id_content_type_key" ON "files"("name", "user_id", "content_type");
