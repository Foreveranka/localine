import {sleep} from "workflow";
async function advance(id:string){
  "use step";
  const {advancePayment}=await import("@/lib/local-worker");
  const done=await advancePayment(id);
  const {localPayment}=await import("@/lib/local-store");
  const payment=await localPayment(id);
  return {done,delay:payment?.status==="awaiting_payment"?15000:3000};
}
async function exhausted(id:string){
  "use step";
  const {sqlDb}=await import("@/lib/local-store");const sql=sqlDb();
  await sql`UPDATE local_payments SET status='review',issue='reconciliation_required',updated_at=${Date.now()} WHERE order_id=${id} AND status NOT IN ('paid','failed','refunded','unavailable','review') AND (lease_until IS NULL OR lease_until<${Date.now()})`;
}
export async function localPaymentWorkflow(id:string){
  "use workflow";
  for(let i=0;i<600;i++){
    const result=await advance(id);
    if(result.done)return;
    await sleep(result.delay);
  }
  await exhausted(id);
}
