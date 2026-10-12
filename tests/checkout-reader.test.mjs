import assert from "node:assert/strict";
import {allowedOrigin, validateRequest, readPaymentRequest, validateRecipient, sameRequest, formatAmount} from "../extension/payment-request.mjs";
const invoiceId="11".repeat(32), recipient="0xd022B96bAB53BbBfFBD9D185F5E4A8c4A3B6C2F0";
const request={version:1,invoiceId,chainId:10143,token:"0x534b2f3A21130d7a60830c2Df862319e593943A3",symbol:"USDC",decimals:6,amount:"3000000",recipient,expiresAt:Date.now()+60000,status:"unpaid"};
request.data="0xa9059cbb"+recipient.slice(2).toLowerCase().padStart(64,"0")+BigInt(request.amount).toString(16).padStart(64,"0")+invoiceId;
const valid=validateRequest(request,invoiceId);
assert.equal(formatAmount(valid.amount),"3.00");
assert.equal(formatAmount("1000100"),"1.0001");
assert.equal(validateRecipient(valid,recipient.toLowerCase()),recipient.toLowerCase());
assert.throws(()=>validateRecipient(valid,"0x"+"22".repeat(20)));
assert.throws(()=>validateRecipient(valid,"0xnot-an-address"));
assert.equal(sameRequest(valid,{...valid,amount:"1"}),false);
assert.equal(sameRequest(valid,{...valid,recipient:"0x"+"22".repeat(20)}),false);
for(const change of [
 {chainId:143},{token:recipient},{decimals:18},{invoiceId:"22".repeat(32)},
 {amount:"0"},{amount:"-1"},{amount:"1.5"},{amount:"15000001"},
 {recipient:"0x"+"00".repeat(20)},{data:"0xa9059cbb"},
 {expiresAt:Date.now()-1},{status:"paid"},
])assert.throws(()=>validateRequest({...request,...change},invoiceId));
for(const url of ["https://evil.example/app","https://shopinbit-monad.vercel.app.evil.example/app","https://shopinbit-monad.vercel.app/","http://shopinbit-monad.vercel.app/app","https://user:pass@shopinbit-monad.vercel.app/app"])assert.throws(()=>allowedOrigin(url));
let calls=0;
const checkout={url:"https://shopinbit-monad.vercel.app/app",id:invoiceId,key:"33".repeat(32),amount:"0",recipient:"0x"+"22".repeat(20)};
const loaded=await readPaymentRequest(checkout,async(url,options)=>{
 calls++;assert.equal(url,`https://shopinbit-monad.vercel.app/api/orders/${invoiceId}/payment-request`);
 assert.equal(options.headers["x-order-key"],checkout.key);assert.equal(options.redirect,"error");
 assert.equal(options.credentials,"omit");return Response.json(request);
});
assert.equal(loaded.amount,"3000000");assert.equal(loaded.recipient,recipient);assert.equal(calls,1);
await assert.rejects(readPaymentRequest({...checkout,url:"https://evil.example/app"},async()=>{throw Error("must not fetch");}));
await assert.rejects(readPaymentRequest(checkout,async()=>Response.json({error:"expired"},{status:410})));
console.log("PASS: server amount overrides page values; rejects wrong origin/network/token/amount/address, altered instructions and expired/paid invoices");
