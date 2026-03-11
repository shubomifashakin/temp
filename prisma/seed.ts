import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { FileStatus, PrismaClient } from '../generated/prisma/client';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const userArray = Array.from({ length: 100 }, (_, i) => ({
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    id: `user-${i + 1}`,
  }));

  const users = await prisma.user.createMany({
    data: userArray,
    skipDuplicates: true,
  });

  const fileArray = Array.from({ length: 1000 }, (_, i) => ({
    name: `File ${i + 1}`,
    status: FileStatus.pending,
    description: `Description for file ${i + 1}`,
    s3Key: `file${i + 1}.txt`,
    contentType: 'text/plain',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    size: 1024,
    id: `file-${i + 1}`,
    userId: userArray[Math.floor(Math.random() * userArray.length)].id,
  }));

  const files = await prisma.file.createMany({
    data: fileArray,
    skipDuplicates: true,
  });

  const links = await prisma.link.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({
      shareId: `share-${i + 1}`,
      clickCount: 0,
      description: `Description for link ${i + 1}`,
      fileId: fileArray[Math.floor(Math.random() * fileArray.length)].id,
      lastAccessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      password: null,
    })),
    skipDuplicates: true,
  });

  console.log({ users, files, links });
}
main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
