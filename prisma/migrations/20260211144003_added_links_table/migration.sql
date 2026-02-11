-- CreateTable
CREATE TABLE "ShareLinks" (
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

    CONSTRAINT "ShareLinks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLinks_id_file_id_key" ON "ShareLinks"("id", "file_id");

-- AddForeignKey
ALTER TABLE "ShareLinks" ADD CONSTRAINT "ShareLinks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "Files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
