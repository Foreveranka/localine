import "server-only";
import {MERCHANT,USDC,CHAIN_ID} from "./payment";
import {quoteMoney} from "./local-money";
import {hmac} from "./iyzico";
export function localQuote(order:{id:string;amount:string;expiresAt:number}){
  const quote={orderId:order.id,amount:order.amount,recipient:MERCHANT,token:USDC,chainId:CHAIN_ID,expiresAt:order.expiresAt,...quoteMoney(order.amount)};
  return {...quote,signature:hmac(`local-quote:v1:${JSON.stringify(quote)}`)};
}
