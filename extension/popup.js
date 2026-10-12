import {allowedOrigin, readPaymentRequest, validateRecipient, sameRequest, formatAmount} from "./payment-request.mjs";
const $ = (id) => document.getElementById(id);
let current = null;
let checkout = null;
let working = false;
async function snapshot() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url) throw new Error("Klon sitenin ödeme ekranını aç.");
  allowedOrigin(tab.url);
  const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:() => {
    const nodes = document.querySelectorAll('[data-shopinbit-checkout="v1"]');
    if (nodes.length !== 1) return null;
    const node = nodes[0];
    return {url:location.href,id:node.getAttribute("data-invoice-id"),key:node.getAttribute("data-order-key")};
  }});
  if (!result) throw new Error("Tek bir hazır ödeme ekranı bulunamadı. Sitede test teklifini aç.");
  if (new URL(result.url).origin !== new URL(tab.url).origin) throw new Error("Site değişti. Faturayı tekrar oku.");
  return {...result,tabId:tab.id};
}
async function run(action) {
  if(working)return;
  working=true;$("read").disabled=true;$("confirm").disabled=true;$("status").textContent="";
  try {await action();} catch(e) {
    current=null;checkout=null;$("invoice").hidden=true;$("status").textContent=e instanceof Error?e.message:"Fatura okunamadı.";
  } finally {working=false;$("read").disabled=false;$("confirm").disabled=false;}
}
$("read").addEventListener("click",()=>run(async()=>{
  current=null;checkout=await snapshot();current=await readPaymentRequest(checkout);
  $("amount").textContent=`${formatAmount(current.amount)} USDC`;
  $("invoice-id").textContent=`#${current.invoiceId.slice(0,12)}`;
  $("expiry").textContent=new Date(current.expiresAt).toLocaleTimeString("tr-TR");
  $("recipient").value="";$("confirm-form").hidden=false;$("confirmed").hidden=true;$("invoice").hidden=false;
}));
$("confirm-form").addEventListener("submit",(event)=>{
  event.preventDefault();void run(async()=>{
    if(!current||!checkout)throw new Error("Önce faturayı oku.");
    const address=validateRecipient(current,$("recipient").value);
    const fresh=await snapshot();
    if(fresh.id!==checkout.id||fresh.key!==checkout.key||fresh.tabId!==checkout.tabId)throw new Error("Aktif fatura değişti. Faturayı tekrar oku.");
    const verified=await readPaymentRequest(fresh);
    if(!sameRequest(current,verified))throw new Error("Ödeme bilgileri değişti. Faturayı tekrar oku.");
    validateRecipient(verified,address);
    $("summary").textContent=`${formatAmount(verified.amount)} USDC → ${address} · Monad Testnet`;
    $("confirm-form").hidden=true;$("confirmed").hidden=false;
  });
});

$("local-pay").addEventListener("click",()=>run(async()=>{
  if(!current||!checkout)throw new Error("Önce faturayı doğrula.");
  const fresh=await snapshot();
  if(fresh.id!==checkout.id||fresh.key!==checkout.key||fresh.tabId!==checkout.tabId)throw new Error("Aktif fatura değişti.");
  const verified=await readPaymentRequest(fresh);
  if(!sameRequest(current,verified))throw new Error("Fatura değişti. Tekrar oku.");
  const address=validateRecipient(verified,$("recipient").value);
  const origin=allowedOrigin(fresh.url);
  const target=new URL(`/pay/${verified.invoiceId}`,origin);
  target.hash=new URLSearchParams({key:fresh.key,recipient:address}).toString();
  await chrome.tabs.create({url:target.href});
}));
