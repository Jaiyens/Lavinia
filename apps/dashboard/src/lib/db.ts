import { PrismaClient } from "@prisma/client";

// Single Prisma client, reused across hot reloads in dev to avoid exhausting
// connections. Import `prisma` anywhere server-side; never from the energy math.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
