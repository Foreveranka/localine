import assert from "node:assert/strict";
import {quoteMoney,decimalMinor,normalizedDecimal} from "@/lib/local-money";
import {classifyCapture,hmac,validatePspSignature,safePaymentPage,INIT_PATH} from "@/lib/iyzico";
process.env.IYZICO_SECRET_KEY="unit-test-only-secret";
let checks=0;
function test(name:string,run:()=>void){run();checks++;console.log("PASS",name);}
const p={orderId:"a".repeat(64),token:"sandbox-test-token",totalMinor:13770};
function signed(values:Record<string,unknown>={}){
  const r={status:"success",paymentStatus:"SUCCESS",paymentId:"123",currency:"TRY",basketId:p.orderId,conversationId:p.orderId,paidPrice:137.7,price:137.7,token:p.token,fraudStatus:1,...values} as Record<string,unknown>;
  r.signature=hmac([r.paymentStatus,r.paymentId,r.currency,r.basketId,r.conversationId,normalizedDecimal(r.paidPrice),normalizedDecimal(r.price),r.token].join(":"));return r;
}
test("3 USDC charges 135 TRY + 2.70 TRY, no USDC deduction",()=>assert.deepEqual(quoteMoney("3000000"),{baseMinor:13500,feeMinor:270,totalMinor:13770,rate:45,commissionBps:200}));
test("15 USDC quote cap",()=>{assert.equal(quoteMoney("15000000").totalMinor,68850);assert.throws(()=>quoteMoney("15000001"));});
test("Reject zero, negative and malformed amounts",()=>{for(const x of ["0","-1","1.1","1e6",""]){assert.throws(()=>quoteMoney(x));}});
test("Money uses exact kuruş",()=>{assert.equal(decimalMinor("137.70"),13770);assert.equal(decimalMinor(137.7),13770);for(const x of ["137.701","NaN","1e2",-1])assert.equal(decimalMinor(x),null);});
test("Official response price normalization",()=>{assert.equal(normalizedDecimal("50.00"),"50");assert.equal(normalizedDecimal("10.51050"),"10.5105");});
test("Signed exact captured payment accepted",()=>assert.equal(classifyCapture(signed(),p),"captured"));
test("Unsigned callback cannot cause payout",()=>assert.throws(()=>classifyCapture({...signed(),signature:undefined},p)));
test("Modified price breaks signature",()=>assert.throws(()=>classifyCapture({...signed(),price:1},p)));
test("Authentic wrong price is held",()=>assert.equal(classifyCapture(signed({price:1,paidPrice:1}),p),"review"));
test("Authentic wrong invoice/token/currency are held",()=>{for(const r of [{basketId:"other"},{conversationId:"other"},{token:"other"},{currency:"USD"}])assert.equal(classifyCapture(signed(r),p),"review");});
test("Fraud pending does not settle",()=>assert.equal(classifyCapture(signed({fraudStatus:0}),p),"pending"));
test("Fraud denied does not settle",()=>assert.equal(classifyCapture(signed({fraudStatus:-1}),p),"review"));
test("Provider errors do not release funds",()=>assert.equal(classifyCapture({status:"failure",errorCode:"5124"},p),"pending"));
test("Signed FAILURE while 3DS is active keeps the reservation",()=>assert.equal(classifyCapture(signed({paymentStatus:"FAILURE"}),p),"pending"));
test("FAILURE can become SUCCESS on the same hosted session",()=>{assert.equal(classifyCapture(signed({paymentStatus:"FAILURE"}),p),"pending");assert.equal(classifyCapture(signed(),p),"captured");});
test("Initialize signature binds invoice and token",()=>{const r={conversationId:p.orderId,token:p.token,signature:hmac(`${p.orderId}:${p.token}`)};validatePspSignature(r,"initialize");assert.throws(()=>validatePspSignature({...r,token:"different"},"initialize"));assert.equal(INIT_PATH,"/payment/iyzipos/checkoutform/initialize/auth/ecom");});
test("Hosted checkout is restricted to actual sandbox host",()=>{assert.equal(safePaymentPage("https://sandbox-cpp.iyzipay.com/?token=x"),"https://sandbox-cpp.iyzipay.com/?token=x");for(const u of ["https://evil.test/","https://sandbox-cpp.iyzipay.com.evil.test/","http://sandbox-cpp.iyzipay.com/","https://user:pass@sandbox-cpp.iyzipay.com/"])assert.throws(()=>safePaymentPage(u));});
console.log(`${checks} payment checks passed`);
