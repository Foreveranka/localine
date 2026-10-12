import { keyHash,json,allowedRequestOrigin } from "@/lib/order-access";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { CATALOG, CHAIN_ID, USDC, MERCHANT, transferData, type Block } from "@/lib/payment";
import { rpc } from "@/lib/rpc";
export const dynamic = "force-dynamic";
function randomHex() {return Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,"0")).join("");}
export async function POST(request: Request) {
  try {
    if(!allowedRequestOrigin(request))return json({error:"Invalid origin"},403);
    const raw=await request.text(); if(raw.length>5000)return json({error:"Request too large"},413);
    const input=JSON.parse(raw), item=CATALOG.find(x=>x.id===input.sku);
    if (!item || !Number.isInteger(input.quantity) || input.quantity<1 || input.quantity>5) return json({error:"Invalid invoice details"},400);
    if(input.payer!=null && (typeof input.payer!=="string" || !/^0x[0-9a-fA-F]{40}$/.test(input.payer) || /^0x0{40}$/i.test(input.payer)))return json({error:"Invalid payer address"},400);
    if(typeof input.detail!=="string" || input.detail.trim().length<3 || input.detail.length>2000 || typeof input.country!=="string" || !["Poland","Türkiye","Germany","France","Netherlands","Other"].includes(input.country))return json({error:"Complete your request details"},400);
    const block=await rpc<Block>("eth_getBlockByNumber",["finalized",false]);
    const id=randomHex(), accessKey=randomHex(), now=Date.now(), amount=(BigInt(item.units)*BigInt(input.quantity)).toString();
    const order={id,accessHash:await keyHash(accessKey),sku:item.id,quantity:input.quantity,detail:input.detail.trim(),country:input.country,payer:input.payer?.toLowerCase()??null,amount,createdBlock:Number(BigInt(block.number)),createdAt:now,expiresAt:now+30*60*1000,status:"unpaid"};
    await getDb().insert(orders).values(order);
    return json({id,accessKey,sku:order.sku,quantity:order.quantity,amount,payer:order.payer,expiresAt:order.expiresAt,status:"unpaid",chainId:CHAIN_ID,token:USDC,recipient:MERCHANT,data:transferData(id,amount)},201);
  } catch {return json({error:"Could not create the invoice. Please try again."},503);}
}
