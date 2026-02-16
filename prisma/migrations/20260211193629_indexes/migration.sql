-- CreateIndex
CREATE INDEX "files_user_id_idx" ON "Files"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "RefreshToken"("user_id");
