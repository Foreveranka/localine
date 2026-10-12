import { CHAIN_ID, USDC, MERCHANT, transferData } from "./payment";

export function paymentRequest(order: {id:string;amount:string;expiresAt:number;status:string}, now=Date.now()) {
  if (order.status !== "unpaid") throw new Error("Invoice is already paid");
  if (order.expiresAt <= now) throw new Error("Invoice expired");
  return {
    version:1, invoiceId:order.id, chainId:CHAIN_ID, network:"Monad Testnet",
    token:USDC, symbol:"USDC", decimals:6, amount:order.amount,
    recipient:MERCHANT, expiresAt:order.expiresAt,
    data:transferData(order.id,order.amount), status:"unpaid",
  };
}
