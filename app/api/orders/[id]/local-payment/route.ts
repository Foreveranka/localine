import {authorizedOrder,json,allowedRequestOrigin} from "@/lib/order-access";
import {localQuote} from "@/lib/local-quote";
import {equalSignature} from "@/lib/iyzico";
import {localPayment,sqlDb,setPayment} from "@/lib/local-store";
import {randomBytes} from "node:crypto";
import {start} from "workflow/api";
import {localPaymentWorkflow} from "@/workflows/local-payment";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
function publicState(p:Awaited<ReturnType<typeof localPayment>>){
  return p?{status:p.status,txHash:p.txHash,pageUrl:p.status==="awaiting_payment"&&Number(p.tokenExpiresAt)>Date.now()?p.pageUrl:null,issue:p.issue,baseMinor:p.baseMinor,feeMinor:p.feeMinor,totalMinor:p.totalMinor}:null;
}
export async function GET(request:Request,ctx:Context){
  try{const order=await authorizedOrder(request,(await ctx.params).id);if(!order)return json({error:"Invoice not found"},404);
    return json({quote:localQuote(order),payment:publicState(await localPayment(order.id)),orderStatus:order.status,paymentMethod:order.paymentMethod});
  }catch{return json({error:"Ödeme bilgileri şu an alınamıyor."},503);}
}
export async function POST(request:Request,ctx:Context){
  try{
    if(!allowedRequestOrigin(request))return json({error:"Invalid origin"},403);
    const order=await authorizedOrder(request,(await ctx.params).id);if(!order)return json({error:"Invoice not found"},404);
    const raw=await request.text();if(raw.length>500)return json({error:"Request too large"},413);
    const input=JSON.parse(raw),quote=localQuote(order);
    if(typeof input.recipient!=="string"||input.recipient.toLowerCase()!==quote.recipient.toLowerCase())return json({error:"Yapıştırılan adres faturadaki satıcıyla eşleşmiyor."},400);
    if(!equalSignature(input.signature,quote.signature))return json({error:"Teklif değişti. Sayfayı yenile."},409);
    if(order.status!=="unpaid"||order.paymentMethod==="wallet"||order.payer)return json({error:"Bu fatura için yerel ödeme açılamaz."},409);
    const existing=await localPayment(order.id);
    if(!existing){
      if(order.expiresAt<Date.now()+60000)return json({error:"Faturanın süresi doluyor. Yeni talep oluştur."},409);
      const now=Date.now(),attempt=`0x${randomBytes(32).toString("hex")}`,sql=sqlDb();
      // One statement atomically selects the payment mode and persists the immutable quote.
      await sql`WITH claimed AS (UPDATE orders SET payment_method='local' WHERE id=${order.id} AND status='unpaid' AND payer IS NULL AND payment_method IS NULL AND expires_at>${now+60000} RETURNING id) INSERT INTO local_payments(order_id,attempt_id,recipient,amount,base_minor,fee_minor,total_minor,status,created_at,updated_at) SELECT id,${attempt},${quote.recipient},${quote.amount},${quote.baseMinor},${quote.feeMinor},${quote.totalMinor},'preparing',${now},${now} FROM claimed ON CONFLICT(order_id) DO NOTHING`;
    }
    const payment=await localPayment(order.id);if(!payment)return json({error:"Başka bir ödeme yöntemi seçildi. Sayfayı yenile."},409);
    if(!payment.runId){const run=await start(localPaymentWorkflow,[order.id]);await setPayment(order.id,{runId:run.runId});}
    return json({payment:publicState(await localPayment(order.id))},202);
  }catch{return json({error:"Ödeme hazırlanamadı. Aynı faturayla tekrar deneyebilirsin."},503);}
}
