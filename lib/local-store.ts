import "server-only";
import { neon } from "@neondatabase/serverless";
import { getDb } from "@/db";
import { localPayments } from "@/db/schema";
import { eq } from "drizzle-orm";
export function sqlDb(){if(!process.env.DATABASE_URL)throw Error("Missing database");return neon(process.env.DATABASE_URL);}
export async function localPayment(id:string){return (await getDb().select().from(localPayments).where(eq(localPayments.orderId,id)).limit(1))[0]??null;}
export type LocalPayment=NonNullable<Awaited<ReturnType<typeof localPayment>>>;
export async function setPayment(id:string,values:Partial<typeof localPayments.$inferInsert>){
  await getDb().update(localPayments).set({...values,updatedAt:Date.now()}).where(eq(localPayments.orderId,id));
}
export async function acquirePayment(id:string,owner:string){
  const now=Date.now();const sql=sqlDb();
  const rows=await sql`UPDATE local_payments SET lease_owner=${owner},lease_until=${now+180000} WHERE order_id=${id} AND (lease_until IS NULL OR lease_until<${now}) RETURNING order_id`;
  return rows.length>0;
}
export async function releasePayment(id:string,owner:string){const sql=sqlDb();await sql`UPDATE local_payments SET lease_owner=NULL,lease_until=NULL WHERE order_id=${id} AND lease_owner=${owner}`;}
