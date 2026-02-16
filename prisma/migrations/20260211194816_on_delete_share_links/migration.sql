-- DropForeignKey
ALTER TABLE "ShareLinks" DROP CONSTRAINT "ShareLinks_file_id_fkey";

-- AddForeignKey
ALTER TABLE "ShareLinks" ADD CONSTRAINT "ShareLinks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "Files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
