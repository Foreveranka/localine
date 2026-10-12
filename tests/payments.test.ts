import assert from 'node:assert/strict';
import {checkPayment,transferData,TRANSFER_TOPIC,USDC,MERCHANT} from '../lib/payment';
const id='11'.repeat(32),hash='0x'+'22'.repeat(32),blockHash='0x'+'33'.repeat(32),payer='0x'+'44'.repeat(20);
const order={id,payer,amount:'1000000',createdBlock:100,createdAt:100000,expiresAt:200000};
const receipt={status:'0x1',blockNumber:'0x65',blockHash,transactionHash:hash,logs:[{address:USDC,topics:[TRANSFER_TOPIC,'0x'+payer.slice(2).padStart(64,'0'),'0x'+MERCHANT.slice(2).toLowerCase().padStart(64,'0')],data:'0x'+BigInt(order.amount).toString(16).padStart(64,'0')}]};
const tx={hash,from:payer,to:USDC,input:transferData(id,order.amount),blockHash};
const block={number:'0x65',hash:blockHash,timestamp:'0x96'},finalized={...block,number:'0x66'};
assert.doesNotThrow(()=>checkPayment(order,hash,receipt,tx,block,finalized));
for(const [name,r,t,b,f,o] of [
 ['wrong token',receipt,{...tx,to:payer},block,finalized,order],
 ['wrong payer',receipt,{...tx,from:MERCHANT},block,finalized,order],
 ['wrong amount',receipt,{...tx,input:transferData(id,'999999')},block,finalized,order],
 ['invoice replay',receipt,{...tx,input:transferData('55'.repeat(32),order.amount)},block,finalized,order],
 ['reverted',{...receipt,status:'0x0'},tx,block,finalized,order],
 ['no transfer event',{...receipt,logs:[]},tx,block,finalized,order],
 ['wrong event amount',{...receipt,logs:[{...receipt.logs[0],data:'0x00'}]},tx,block,finalized,order],
 ['unfinalized',receipt,tx,block,{...finalized,number:'0x64'},order],
 ['reorg',receipt,tx,{...block,hash:hash},finalized,order],
 ['predates invoice',receipt,tx,block,finalized,{...order,createdBlock:102}],
 ['expired',receipt,tx,{...block,timestamp:'0xfa'},finalized,order],
]){assert.throws(()=>checkPayment(o as typeof order,hash,r as typeof receipt,t as typeof tx,b as typeof block,f as typeof finalized),{name:'Error'},String(name));}
assert.throws(()=>checkPayment({...order,payer:null},hash,receipt,tx,block,finalized));
console.log('PASS: valid payment plus 12 invalid/unbound/replay/reorg cases');
