import {notFound} from "next/navigation";
import LocalCheckout from "@/components/local-checkout";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^[a-f0-9]{64}$/.test(id))notFound();return <LocalCheckout id={id}/>;}
