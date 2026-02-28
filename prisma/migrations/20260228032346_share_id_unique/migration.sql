/*
  Warnings:

  - A unique constraint covering the columns `[share_id]` on the table `links` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "links_share_id_key" ON "links"("share_id");
