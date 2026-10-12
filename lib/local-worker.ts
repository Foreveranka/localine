import "server-only";
import {randomUUID} from "node:crypto";
import {keccak256,toHex,type Hex} from "viem";
import {localPayment,setPayment,acquirePayment,releasePayment,sqlDb} from "./local-store";
import {poolAction,poolInvoice,verifySettlement,DefiniteChainFailure} from "./pool-server";
import {pspCall,initializeBody,INIT_PATH,RETRIEVE_PATH,validatePspSignature,safePaymentPage,classifyCapture} from "./iyzico";
import {priceString,normalizedDecimal,decimalMinor} from "./local-money";
const terminal=new Set(["paid","failed","refunded","review","unavailable"]);
// Every invocation is safe to replay; PSP initialization/refund are claimed before calling.
export async function advancePayment(id:string):Promise<boolean>{
  const owner=randomUUID();
  if(!await acquirePayment(id,owner))return false;
  try{
    const p=await localPayment(id);if(!p||terminal.has(p.status))return true;
    console.info("local-payment step",{order:id.slice(0,12),phase:p.status});
    const sql=sqlDb();
    if(p.status==="preparing"){
      const [order]=await sql`SELECT expires_at FROM orders WHERE id=${id}`;
      const invoice=await poolInvoice(id);
      if(invoice[2]===0){
        if(Number(order.expires_at)<=Date.now()+15000){await setPayment(id,{status:"unavailable",issue:"invoice_expired"});return true;}
        if(!await poolAction(id,"register",[`0x${id}`,p.recipient,BigInt(p.amount),BigInt(Math.floor(Number(order.expires_at)/1000))]))return false;
      }else if(invoice[0].toLowerCase()!==p.recipient.toLowerCase()||invoice[3]!==BigInt(p.amount)||invoice[1]!==BigInt(Math.floor(Number(order.expires_at)/1000))){
        await setPayment(id,{status:"review",issue:"invoice_mismatch"});return true;
      }
      await setPayment(id,{status:"reserving"});return false;
    }
    if(p.status==="reserving"){
      try{if(!await poolAction(id,"reserve",[`0x${id}`,p.attemptId]))return false;}
      catch(e){if(e instanceof DefiniteChainFailure){await setPayment(id,{status:"cancel_pending",issue:"pool_unavailable"});return false;}throw e;}
      await setPayment(id,{status:"initialize_ready"});return false;
    }
    if(p.status==="initialize_ready"){
      // Do not retry initialize after an ambiguous response: iyzico conversationId is not an idempotency key.
      await setPayment(id,{status:"initializing"});
      try{
        const r=await pspCall(INIT_PATH,initializeBody(p));
        if(r.status!=="success"){await setPayment(id,{status:"release_pending",issue:"checkout_rejected"});return false;}
        validatePspSignature(r,"initialize");
        if(r.conversationId!==id||typeof r.token!=="string"||!r.token||r.token.length>512)throw Error("Invalid checkout response");
        const ttl=Number(r.tokenExpireTime);
        if(!Number.isFinite(ttl)||ttl<60||ttl>86400)throw Error("Invalid checkout lifetime");
        await setPayment(id,{status:"awaiting_payment",token:r.token,pageUrl:safePaymentPage(r.paymentPageUrl),tokenExpiresAt:Date.now()+ttl*1000});
        return false;
      }catch{await setPayment(id,{status:"review",issue:"checkout_result_unknown"});return true;}
    }
    if(p.status==="initializing"||p.status==="refunding"){
      await setPayment(id,{status:"review",issue:"provider_result_unknown"});return true;
    }
    if(p.status==="awaiting_payment"){
      const r=await pspCall(RETRIEVE_PATH,{locale:"tr",conversationId:id,token:p.token});
      let decision;
      try{decision=classifyCapture(r,p);}catch{await setPayment(id,{status:"review",issue:"provider_signature_invalid"});return true;}
      if(decision==="pending"){
        if(p.tokenExpiresAt&&Date.now()>p.tokenExpiresAt+3600000){await setPayment(id,{status:"review",issue:"payment_unresolved"});return true;}
        return false;
      }
      if(decision==="review"){await setPayment(id,{status:"review",issue:"payment_details_mismatch"});return true;}
      const paymentId=String(r.paymentId),paymentRef=keccak256(toHex(`iyzico:sandbox:${paymentId}`));
      // Unique payment_id and payment_ref prevent a capture being reused for a different invoice.
      await setPayment(id,{status:"captured",paymentId,paymentRef});return false;
    }
    if(p.status==="captured"){
      let hash:Hex|null;
      try{hash=await poolAction(id,"settle",[`0x${id}`,p.attemptId,p.paymentRef]);}
      catch(e){if(e instanceof DefiniteChainFailure){await setPayment(id,{status:"refund_required",issue:"settlement_rejected"});return false;}throw e;}
      if(!hash)return false;
      await verifySettlement(p,hash);
      // Atomically record final receipt and paid order. Replays cannot turn a refunded order paid.
      await sql`WITH settled AS (UPDATE local_payments SET status='paid',tx_hash=${hash},updated_at=${Date.now()} WHERE order_id=${id} AND status='captured' RETURNING order_id) UPDATE orders SET status='paid',tx_hash=${hash},paid_at=${Date.now()} WHERE id IN (SELECT order_id FROM settled) AND payment_method='local' AND status='unpaid'`;
      return true;
    }
    if(p.status==="refund_required"){
      // Only reached after a finalized revert or an unsent, rejected settlement. Never refund an ambiguous tx.
      await setPayment(id,{status:"refunding"});
      try{
        const r=await pspCall("/v2/payment/refund",{locale:"tr",conversationId:id,paymentId:p.paymentId,price:priceString(p.totalMinor),currency:"TRY",ip:"127.0.0.1"});
        const expected=[String(r.paymentId),normalizedDecimal(r.price),String(r.currency),String(r.conversationId)].join(":");
        const {equalSignature,hmac}=await import("./iyzico");
        if(r.status!=="success"||String(r.paymentId)!==p.paymentId||decimalMinor(r.price)!==p.totalMinor||r.currency!=="TRY"||r.conversationId!==id||!equalSignature(r.signature,hmac(expected)))throw Error("Refund unresolved");
        await setPayment(id,{status:"release_pending",issue:"refund_confirmed"});return false;
      }catch{await setPayment(id,{status:"review",issue:"refund_result_unknown"});return true;}
    }
    if(p.status==="release_pending"){
      const invoice=await poolInvoice(id);
      if(invoice[2]===2&&!await poolAction(id,"release",[`0x${id}`,p.attemptId]))return false;
      await setPayment(id,{status:"cancel_pending"});return false;
    }
    if(p.status==="cancel_pending"){
      const invoice=await poolInvoice(id);
      if(invoice[2]===1&&!await poolAction(id,"cancel",[`0x${id}`]))return false;
      await setPayment(id,{status:p.issue==="refund_confirmed"?"refunded":p.issue==="pool_unavailable"?"unavailable":"failed"});return true;
    }
    await setPayment(id,{status:"review",issue:"unknown_state"});return true;
  }catch{
    // Keep durable state/reservation on network ambiguity. The workflow retries without creating a second payment.
    console.warn("local-payment transient failure",{order:id.slice(0,12)});
    return false;
  }finally{await releasePayment(id,owner);}
}
