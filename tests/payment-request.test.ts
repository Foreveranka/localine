import assert from "node:assert/strict";
import {paymentRequest} from "../lib/payment-request";
const order={id:"11".repeat(32),amount:"3000000",expiresAt:2000,status:"unpaid"};
const request=paymentRequest(order,1000);
assert.equal(request.amount,"3000000");assert.equal(request.chainId,10143);
assert.equal(request.decimals,6);assert.ok(!("detail" in request));assert.ok(!("accessKey" in request));
assert.throws(()=>paymentRequest({...order,status:"paid"},1000));
assert.throws(()=>paymentRequest(order,2000));
console.log("PASS: minimal payable invoice response, paid/expired rejection");
