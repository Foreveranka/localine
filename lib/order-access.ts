import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function keyHash(key: string) {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,"0")).join("");}
export function json(data: unknown, status = 200) {return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
export function allowedRequestOrigin(request:Request) {
  const origin=request.headers.get("origin");
  if(!origin)return true;
  const allowed=["https://shopinbit-monad.vercel.app",new URL(request.url).origin];
  if(process.env.VERCEL_URL)allowed.push(`https://${process.env.VERCEL_URL}`);
  if(process.env.NODE_ENV==="development")allowed.push("http://127.0.0.1:4173","http://localhost:4173");
  return allowed.includes(origin);
}
export async function authorizedOrder(request: Request, id: string) {
  const key = request.headers.get("x-order-key") ?? "";
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(key)) return null;
  const rows = await getDb().select().from(orders).where(and(eq(orders.id, id), eq(orders.accessHash, await keyHash(key)))).limit(1);
  return rows[0] ?? null;
}
