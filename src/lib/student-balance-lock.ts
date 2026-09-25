import { Prisma } from "@/generated/prisma";
/** Use the same lock order for every balance mutation, including isolated tests. */
export async function lockStudentBalance(tx: Prisma.TransactionClient, userId: string) {
  const schema = process.env.DATABASE_SCHEMA ?? "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("Invalid database schema");
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(`"${schema}"."User"`)} WHERE id = ${userId} FOR UPDATE`);
}
