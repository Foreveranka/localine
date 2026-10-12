import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { keyHash, json } from "@/lib/order-access";
import { CHAIN_ID, MERCHANT, USDC, transferData, checkPayment, type Block, type Receipt, type Transaction } from "@/lib/payment";
import { rpc } from "@/lib/rpc";
export const dynamic = "force-dynamic";
type Context={params:Promise<{id:string}>};
async function authorized(request:Request,ctx:Context) {
  const {id}=await ctx.params,key=request.headers.get("x-order-key")??"";
  if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{64}$/.test(key))return null;
  const rows=await getDb().select().from(orders).where(and(eq(orders.id,id),eq(orders.accessHash,await keyHash(key)))).limit(1);
  return rows[0]??null;
}
export async function GET(request:Request,ctx:Context) {
  const order=await authorized(request,ctx);
  if(!order)return json({error:"Invoice not found"},404);
  const {accessHash,...safe}=order;void accessHash;
  return json({...safe,chainId:CHAIN_ID,token:USDC,recipient:MERCHANT,data:transferData(order.id,order.amount)});
}
export async function POST(request:Request,ctx:Context) {
  try {
    const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return json({error:"Invalid origin"},403);
    const order=await authorized(request,ctx);if(!order)return json({error:"Invoice not found"},404);
    const raw=await request.text();if(raw.length>500)return json({error:"Request too large"},413);
    const {hash}=JSON.parse(raw);if(typeof hash!=="string"||!/^0x[a-fA-F0-9]{64}$/.test(hash))return json({error:"Invalid transaction hash"},400);
    if(order.status==="paid")return order.txHash===hash.toLowerCase()?json({status:"paid",txHash:order.txHash}):json({error:"Invoice already paid"},409);
    const [receipt,tx,finalized]=await Promise.all([rpc<Receipt|null>("eth_getTransactionReceipt",[hash]),rpc<Transaction|null>("eth_getTransactionByHash",[hash]),rpc<Block>("eth_getBlockByNumber",["finalized",false])]);
    if(!receipt||!tx)return json({error:"Transaction is not included yet. Check again shortly."},202);
    const block=await rpc<Block>("eth_getBlockByNumber",[receipt.blockNumber,false]);
    checkPayment(order,hash,receipt,tx,block,finalized);
    const updated=await getDb().update(orders).set({status:"paid",txHash:hash.toLowerCase(),paidAt:Date.now()}).where(and(eq(orders.id,order.id),eq(orders.status,"unpaid"))).returning({id:orders.id});
    if(!updated.length)return json({error:"Invoice was already settled"},409);
    return json({status:"paid",txHash:hash.toLowerCase()});
  }catch(e){return json({error:e instanceof Error?e.message:"Payment could not be verified"},422);}
}
