import {localPayment} from "@/lib/local-store";
export const maxDuration=60;
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
  const {id}=await ctx.params;if(!/^[a-f0-9]{64}$/.test(id))return new Response("Not found",{status:404});
  const raw=await request.text();if(raw.length>4096)return new Response("Too large",{status:413});
  const token=new URLSearchParams(raw).get("token"),payment=await localPayment(id);
  if(!token||!payment?.token||token!==payment.token)return new Response("Invalid callback",{status:403});
  // This redirect has no financial side effects. The durable worker retrieves the PSP result.
  return Response.redirect(`https://shopinbit-monad.vercel.app/pay/${id}`,303);
}
