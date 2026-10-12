import "server-only";
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {decimalMinor,normalizedDecimal,priceString} from "./local-money";
import type {LocalPayment} from "./local-store";
export const INIT_PATH="/payment/iyzipos/checkoutform/initialize/auth/ecom";
export const RETRIEVE_PATH="/payment/iyzipos/checkoutform/auth/ecom/detail";
export type PspResponse=Record<string,unknown>;
export function hmac(value:string){const secret=process.env.IYZICO_SECRET_KEY;if(!secret)throw Error("PSP not configured");return createHmac("sha256",secret).update(value).digest("hex");}
export function equalSignature(a:unknown,b:string){return typeof a==="string"&&/^[a-f0-9]{64}$/i.test(a)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));}
export function validatePspSignature(response:PspResponse,kind:"initialize"|"retrieve"){
  const fields=kind==="initialize"?["conversationId","token"]:["paymentStatus","paymentId","currency","basketId","conversationId","paidPrice","price","token"];
  const values=fields.map(k=>{if(response[k]===undefined||response[k]===null)throw Error("Incomplete PSP response");return ["price","paidPrice"].includes(k)?normalizedDecimal(response[k]):String(response[k]);});
  if(!equalSignature(response.signature,hmac(values.join(":"))))throw Error("Invalid PSP response signature");
}
export async function pspCall(path:string,body:Record<string,unknown>):Promise<PspResponse>{
  const base=process.env.IYZICO_BASE_URL;
  if(base!=="https://sandbox-api.iyzipay.com")throw Error("Only iyzico sandbox is enabled");
  const key=process.env.IYZICO_API_KEY;if(!key)throw Error("PSP not configured");
  const random=randomBytes(16).toString("hex"),raw=JSON.stringify(body);
  const authorization=Buffer.from(`apiKey:${key}&randomKey:${random}&signature:${hmac(random+path+raw)}`).toString("base64");
  const res=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`IYZWSv2 ${authorization}`,"x-iyzi-rnd":random,"x-iyzi-client-version":"shopinbit-monad-sandbox-1"},body:raw,signal:AbortSignal.timeout(15000),cache:"no-store"});
  if(!res.ok)throw Error("PSP request is unresolved");
  return await res.json() as PspResponse;
}
export function safePaymentPage(value:unknown){
  if(typeof value!=="string")throw Error("Missing hosted checkout");
  const u=new URL(value);
  if(u.protocol!=="https:"||u.hostname!=="sandbox-cpp.iyzipay.com"||u.username||u.password)throw Error("Unexpected PSP checkout host");
  return u.href;
}
export function initializeBody(p:LocalPayment){
  const amount=priceString(p.totalMinor);
  const address={contactName:"Test Buyer",city:"Istanbul",country:"Turkey",address:"Test Mah. Test Cad. No:1",zipCode:"34000"};
  return {locale:"tr",conversationId:p.orderId,price:amount,paidPrice:amount,currency:"TRY",basketId:p.orderId,paymentGroup:"PRODUCT",enabledInstallments:[1],
    callbackUrl:`https://shopinbit-monad.vercel.app/api/payments/callback/${p.orderId}`,
    buyer:{id:p.orderId,name:"Test",surname:"Buyer",gsmNumber:"+905350000000",email:"buyer@example.com",identityNumber:"11111111111",registrationAddress:address.address,city:"Istanbul",country:"Turkey",ip:"127.0.0.1",zipCode:"34000"},
    shippingAddress:address,billingAddress:address,basketItems:[{id:p.orderId,name:"ShopinBit test request",category1:"Demo",itemType:"VIRTUAL",price:amount}]};
}
export function classifyCapture(r:PspResponse,p:Pick<LocalPayment,"orderId"|"token"|"totalMinor">):"captured"|"pending"|"review"{
  if(r.status!=="success")return "pending"; // Token-not-found/transport errors are not evidence of no capture.
  validatePspSignature(r,"retrieve");
  if(r.token!==p.token||r.conversationId!==p.orderId||r.basketId!==p.orderId||r.currency!=="TRY"||decimalMinor(r.price)!==p.totalMinor||decimalMinor(r.paidPrice)!==p.totalMinor)return "review";
  // A live CF token can report FAILURE while 3DS is pending and later become SUCCESS.
  // Even a signed failure is not proof that this hosted session can no longer capture.
  if(r.paymentStatus==="FAILURE")return "pending";
  if(r.paymentStatus!=="SUCCESS"||Number(r.fraudStatus)===0)return "pending";
  if(Number(r.fraudStatus)!==1||!/^\d+$/.test(String(r.paymentId)))return "review";
  return "captured";
}
