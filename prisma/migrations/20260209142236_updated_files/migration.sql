-- AlterTable
ALTER TABLE "Files" ALTER COLUMN "deleted_at" DROP NOT NULL,
ALTER COLUMN "last_accesed_at" DROP NOT NULL;
