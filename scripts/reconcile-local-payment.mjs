// Server-side operator recovery. Requires the project's private local environment.
import {build} from "esbuild";
import {mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
const id=process.argv[2];if(!/^[a-f0-9]{64}$/.test(id??""))throw Error("Provide one invoice ID");
await mkdir(".local",{recursive:true});
const source=`
import {localPayment,setPayment} from "./lib/local-store";
import {pspCall,RETRIEVE_PATH,classifyCapture} from "./lib/iyzico";
import {advancePayment} from "./lib/local-worker";
import {keccak256,toHex} from "viem";
const id=process.argv[2];
const p=await localPayment(id);
if(!p)throw Error("Invoice not found");
if(p.status==="review"){
  if(!p.token||!["sandbox_result_reconciliation","payment_unresolved","provider_signature_invalid","payment_details_mismatch","reconciliation_required"].includes(p.issue??""))throw Error("Provider initialization/refund ambiguity requires provider-side reconciliation; automatic recovery is forbidden");
  const r=await pspCall(RETRIEVE_PATH,{locale:"tr",conversationId:id,token:p.token});
  if(classifyCapture(r,p)!=="captured")throw Error("No authenticated exact approved capture; no changes made");
  const paymentId=String(r.paymentId),paymentRef=keccak256(toHex("iyzico:sandbox:"+paymentId));
  if(p.paymentId&&p.paymentId!==paymentId)throw Error("Payment ID changed; manual review required");
  await setPayment(id,{status:"captured",paymentId,paymentRef,issue:"capture_reconciled"});
}
for(let i=0;i<24;i++){
  const done=await advancePayment(id);const row=await localPayment(id);
  console.log(JSON.stringify({invoice:id,status:row?.status,issue:row?.issue,txHash:row?.txHash}));
  if(done)break;
  await new Promise(r=>setTimeout(r,3000));
}
`;
await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:"operator-reconciliation.ts",loader:"ts"},outfile:".local/operator-reconciliation.mjs",bundle:true,platform:"node",format:"esm",packages:"external",plugins:[{name:"server-only-node-cli",setup(b){b.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"cli"}));b.onLoad({filter:/.*/,namespace:"cli"},()=>({contents:""}));}}]});
execFileSync(process.execPath,["--env-file=.env.local",".local/operator-reconciliation.mjs",id],{stdio:"inherit"});
