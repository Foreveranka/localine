import {allowedOrigin, readPaymentRequest, validateRecipient, sameRequest, formatAmount} from "./payment-request.mjs";
import {isLanguage, browserLanguage, detectLanguage, translate, localizeError, paymentError, localeTags} from "./i18n.mjs";
const $ = (id) => document.getElementById(id);
let current = null;
let checkout = null;
let working = false;
let language = browserLanguage(chrome.i18n?.getUILanguage?.() || navigator.language);
let languageSource = "detecting";
let languageRevision = 0;
let lastError = null;
let lastFallback = "readFailed";
function renderLanguage() {
  document.documentElement.lang = language;
  $("language").value = language;
  document.querySelectorAll("[data-i18n]").forEach(node => {node.textContent = translate(language,node.dataset.i18n);});
  $("language-status").textContent = translate(language,languageSource);
  if(current) $("expiry").textContent = new Date(current.expiresAt).toLocaleTimeString(localeTags[language]);
  $("status").textContent = lastError ? localizeError(lastError,language,lastFallback) : "";
}
async function initializeLanguage() {
  let saved;
  try {saved=localStorage.getItem("localine.language");} catch {}
  if(isLanguage(saved)){language=saved;languageSource="saved";renderLanguage();return;}
  const revision=languageRevision;
  renderLanguage();
  const detected=await detectLanguage(fetch,language);
  if(revision!==languageRevision)return;
  language=detected.language;languageSource=detected.source;renderLanguage();
}
$("language").addEventListener("change",()=>{
  const selected=$("language").value;
  if(!isLanguage(selected))return;
  languageRevision++;language=selected;languageSource="saved";
  try {localStorage.setItem("localine.language",language);} catch {}
  renderLanguage();
});
async function snapshot() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url) throw paymentError("openCheckout");
  allowedOrigin(tab.url);
  const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:() => {
    const nodes = document.querySelectorAll('[data-shopinbit-checkout="v1"]');
    if (nodes.length !== 1) return null;
    const node = nodes[0];
    return {url:location.href,id:node.getAttribute("data-invoice-id"),key:node.getAttribute("data-order-key")};
  }});
  if (!result) throw paymentError("checkoutMissing");
  if (new URL(result.url).origin !== new URL(tab.url).origin) throw paymentError("siteChanged");
  return {...result,tabId:tab.id};
}
async function run(action, fallback="readFailed") {
  if(working)return;
  working=true;lastError=null;lastFallback=fallback;$("read").disabled=true;$("confirm").disabled=true;$("local-pay").disabled=true;$("status").textContent="";
  try {await action();} catch(e) {
    current=null;checkout=null;lastError=e;$("invoice").hidden=true;$("status").textContent=localizeError(e,language,fallback);
  } finally {working=false;$("read").disabled=false;$("confirm").disabled=false;$("local-pay").disabled=false;}
}
$("read").addEventListener("click",()=>run(async()=>{
  current=null;checkout=await snapshot();current=await readPaymentRequest(checkout);
  $("amount").textContent=`${formatAmount(current.amount)} USDC`;
  $("invoice-id").textContent=`#${current.invoiceId.slice(0,12)}`;
  $("expiry").textContent=new Date(current.expiresAt).toLocaleTimeString(localeTags[language]);
  $("recipient").value="";$("confirm-form").hidden=false;$("confirmed").hidden=true;$("invoice").hidden=false;
}));
$("confirm-form").addEventListener("submit",(event)=>{
  event.preventDefault();void run(async()=>{
    if(!current||!checkout)throw paymentError("readFirst");
    const address=validateRecipient(current,$("recipient").value);
    const fresh=await snapshot();
    if(fresh.id!==checkout.id||fresh.key!==checkout.key||fresh.tabId!==checkout.tabId)throw paymentError("invoiceChanged");
    const verified=await readPaymentRequest(fresh);
    if(!sameRequest(current,verified))throw paymentError("detailsChanged");
    validateRecipient(verified,address);
    $("summary").textContent=`${formatAmount(verified.amount)} USDC → ${address} · Monad Testnet`;
    $("confirm-form").hidden=true;$("confirmed").hidden=false;
  });
});

$("local-pay").addEventListener("click",()=>run(async()=>{
  if(!current||!checkout)throw paymentError("verifyFirst");
  const fresh=await snapshot();
  if(fresh.id!==checkout.id||fresh.key!==checkout.key||fresh.tabId!==checkout.tabId)throw paymentError("invoiceChanged");
  const verified=await readPaymentRequest(fresh);
  if(!sameRequest(current,verified))throw paymentError("invoiceChanged");
  const address=validateRecipient(verified,$("recipient").value);
  const origin=allowedOrigin(fresh.url);
  const target=new URL(`/pay/${verified.invoiceId}`,origin);
  target.hash=new URLSearchParams({key:fresh.key,recipient:address}).toString();
  await chrome.tabs.create({url:target.href});
},"continueFailed"));

void initializeLanguage();
