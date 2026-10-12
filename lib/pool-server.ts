import "server-only";
import {createPublicClient,createWalletClient,defineChain,http,fallback,encodeFunctionData,keccak256,decodeEventLog,BaseError,ContractFunctionRevertedError,ExecutionRevertedError,type Hex,type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {randomUUID} from "node:crypto";
import deployment from "@/contracts/deployments/monad-testnet.json";
import abiJson from "@/contracts/deployments/SettlementPool.abi.json";
import {CHAIN_ID,USDC,MERCHANT,RPCS,TRANSFER_TOPIC} from "./payment";
import {sqlDb,type LocalPayment} from "./local-store";
const abi=abiJson as readonly Record<string,unknown>[];
export const POOL=deployment.address as Address;
const chain=defineChain({id:CHAIN_ID,name:"Monad Testnet",nativeCurrency:{name:"MON",symbol:"MON",decimals:18},rpcUrls:{default:{http:RPCS}}});
const transport=()=>fallback(RPCS.map(url=>http(url,{timeout:10000,retryCount:0})),{retryCount:0});
export const poolClient=createPublicClient({chain,transport:transport()});
export class DefiniteChainFailure extends Error {}
function roleAccount(role:"manager"|"operator"){
  const key=process.env[role==="manager"?"POOL_MANAGER_PRIVATE_KEY":"POOL_OPERATOR_PRIVATE_KEY"];
  if(!key||!/^0x[0-9a-f]{64}$/i.test(key))throw Error("Pool role is not configured");
  const account=privateKeyToAccount(key as Hex);
  if(account.address.toLowerCase()!==(role==="manager"?deployment.invoiceManager:deployment.operator).toLowerCase())throw Error("Pool role mismatch");
  return account;
}
export async function poolInvoice(id:string){
  return await poolClient.readContract({address:POOL,abi,functionName:"invoices",args:[`0x${id}`],blockTag:"finalized"}) as readonly [Address,bigint,number,bigint,Hex,Hex];
}
export async function verifiedPool(){
  const [network,code,token,manager,operator]=await Promise.all([poolClient.getChainId(),poolClient.getCode({address:POOL,blockTag:"finalized"}),poolClient.readContract({address:POOL,abi,functionName:"usdc",blockTag:"finalized"}),poolClient.readContract({address:POOL,abi,functionName:"invoiceManager",blockTag:"finalized"}),poolClient.readContract({address:POOL,abi,functionName:"operator",blockTag:"finalized"})]);
  if(network!==CHAIN_ID||!code||keccak256(code)!==deployment.runtimeCodeHash||String(token).toLowerCase()!==USDC.toLowerCase()||String(manager).toLowerCase()!==deployment.invoiceManager.toLowerCase()||String(operator).toLowerCase()!==deployment.operator.toLowerCase())throw Error("Pool deployment verification failed");
}
// Persist signed bytes BEFORE broadcasting. Replays reuse exactly the same nonce and hash.
export async function poolAction(id:string,kind:"register"|"reserve"|"settle"|"release"|"cancel",args:readonly unknown[]):Promise<Hex|null>{
  await verifiedPool();
  const role=kind==="register"||kind==="cancel"?"manager":"operator",account=roleAccount(role),sql=sqlDb();
  const action=`${id}:${kind}`;
  let rows=await sql`SELECT raw,hash,status FROM chain_transactions WHERE action=${action}`;
  if(!rows.length){
    const owner=randomUUID(),now=Date.now();
    const locked=await sql`INSERT INTO chain_locks(account,owner,"until") VALUES(${account.address.toLowerCase()},${owner},${now+120000}) ON CONFLICT(account) DO UPDATE SET owner=EXCLUDED.owner,"until"=EXCLUDED."until" WHERE chain_locks."until"<${now} RETURNING account`;
    if(!locked.length)return null;
    try{
      rows=await sql`SELECT raw,hash,status FROM chain_transactions WHERE action=${action}`;
      if(!rows.length){
        const functionName={register:"registerInvoice",reserve:"reserve",settle:"settle",release:"release",cancel:"cancelInvoice"}[kind];
        const data=encodeFunctionData({abi,functionName,args});
        const [networkNonce,stored]=await Promise.all([poolClient.getTransactionCount({address:account.address,blockTag:"pending"}),sql`SELECT MAX(nonce) AS last FROM chain_transactions WHERE account=${account.address.toLowerCase()}`]);
        const nonce=Math.max(networkNonce,stored[0]?.last===null?0:Number(stored[0]?.last??-1)+1);
        const wallet=createWalletClient({chain,account,transport:transport()});
        let gas:bigint;
        try{gas=await poolClient.estimateGas({account,to:POOL,data});}catch(e){
          if(e instanceof BaseError&&e.walk(c=>c instanceof ContractFunctionRevertedError||c instanceof ExecutionRevertedError) instanceof BaseError)throw new DefiniteChainFailure("Pool rejected this action before broadcast");
          throw e;
        }
        const request=await wallet.prepareTransactionRequest({account,to:POOL,data,nonce,gas:gas+gas/10n,chain});
        const raw=await wallet.signTransaction(request),hash=keccak256(raw);
        await sql`INSERT INTO chain_transactions(action,account,nonce,raw,hash,created_at) VALUES(${action},${account.address.toLowerCase()},${nonce},${raw},${hash},${Date.now()}) ON CONFLICT(action) DO NOTHING`;
        rows=await sql`SELECT raw,hash,status FROM chain_transactions WHERE action=${action}`;
      }
    }finally{await sql`DELETE FROM chain_locks WHERE account=${account.address.toLowerCase()} AND owner=${owner}`;}
  }
  const hash=rows[0].hash as Hex;
  let receipt;
  try{receipt=await poolClient.getTransactionReceipt({hash});}catch{
    try{await poolClient.sendRawTransaction({serializedTransaction:rows[0].raw as Hex});}catch{} // receipt/state decide, never a send error
    return null;
  }
  const [canonical,finalized]=await Promise.all([poolClient.getBlock({blockNumber:receipt.blockNumber}),poolClient.getBlock({blockTag:"finalized"})]);
  if(finalized.number<receipt.blockNumber||canonical.hash!==receipt.blockHash)return null;
  if(receipt.status!=="success"){
    await sql`UPDATE chain_transactions SET status='reverted' WHERE action=${action}`;
    throw new DefiniteChainFailure("Pool action definitively reverted");
  }
  await sql`UPDATE chain_transactions SET status='finalized' WHERE action=${action}`;
  return hash;
}
export async function verifySettlement(p:LocalPayment,hash:Hex){
  const [invoice,receipt,tx,finalized]=await Promise.all([poolInvoice(p.orderId),poolClient.getTransactionReceipt({hash}),poolClient.getTransaction({hash}),poolClient.getBlock({blockTag:"finalized"})]);
  const canonical=await poolClient.getBlock({blockNumber:receipt.blockNumber});
  if(receipt.status!=="success"||canonical.hash!==receipt.blockHash||finalized.number<receipt.blockNumber||tx.to?.toLowerCase()!==POOL.toLowerCase()||tx.from.toLowerCase()!==deployment.operator.toLowerCase())throw Error("Settlement is not finalized");
  if(invoice[2]!==3||invoice[0].toLowerCase()!==p.recipient.toLowerCase()||invoice[3]!==BigInt(p.amount)||invoice[4]!==p.attemptId||invoice[5]!==p.paymentRef)throw Error("Pool invoice mismatch");
  let settled=false,transfer=false;
  for(const log of receipt.logs){
    if(log.address.toLowerCase()===POOL.toLowerCase()){
      try{const event=decodeEventLog({abi,eventName:"Settled",data:log.data,topics:log.topics}) as unknown as {args:{invoiceId:Hex;paymentRef:Hex;recipient:Address;attemptId:Hex;amount:bigint}};
        const a=event.args;settled||=a.invoiceId===`0x${p.orderId}`&&a.paymentRef===p.paymentRef&&a.attemptId===p.attemptId&&a.recipient.toLowerCase()===MERCHANT.toLowerCase()&&a.amount===BigInt(p.amount);
      }catch{}
    }
    if(log.address.toLowerCase()===USDC.toLowerCase()&&log.topics[0]===TRANSFER_TOPIC&&log.topics[1]===`0x${POOL.slice(2).padStart(64,"0")}`&&log.topics[2]?.toLowerCase()===`0x${p.recipient.slice(2).toLowerCase().padStart(64,"0")}`&&BigInt(log.data)===BigInt(p.amount))transfer=true;
  }
  if(!settled||!transfer)throw Error("Expected pool payment evidence is missing");
}
