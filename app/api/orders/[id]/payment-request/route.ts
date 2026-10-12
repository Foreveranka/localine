import { authorizedOrder, json } from "@/lib/order-access";
import { paymentRequest } from "@/lib/payment-request";
export const dynamic="force-dynamic";
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}) {
  try {
    const order=await authorizedOrder(request,(await ctx.params).id);
    if(!order)return json({error:"Invoice not found"},404);
    if(order.status!=="unpaid"||order.expiresAt<=Date.now())return json({error:"Invoice is already paid or expired"},410);
    return json(paymentRequest(order));
  }catch{return json({error:"Could not read payment details. Try again."},503);}
}
