"use client";
import {useEffect,useState} from "react";
import {EXPLORER} from "@/lib/payment";
type Quote={orderId:string;amount:string;recipient:string;chainId:number;expiresAt:number;baseMinor:number;feeMinor:number;totalMinor:number;rate:number;commissionBps:number;signature:string};
type Payment={status:string;pageUrl:string|null;txHash:string|null;issue:string|null};
const money=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"TRY"}).format(minor/100);
const labels:Record<string,string>={preparing:"Registering invoice with the pool",reserving:"Reserving USDC for the merchant",initialize_ready:"Preparing card checkout",initializing:"Preparing card checkout",awaiting_payment:"Waiting for your card payment",captured:"Card payment confirmed. Sending USDC to the merchant",refund_required:"USDC transfer failed. Preparing your card refund",refunding:"Processing your card refund",release_pending:"Recording payment result",cancel_pending:"Recording payment result",failed:"Card payment was not completed",refunded:"Card payment refunded",unavailable:"Payment is currently unavailable for this order",review:"Payment needs review. Do not pay again",paid:"Payment completed"};
export default function LocalCheckout({id}:{id:string}){
  const [ready,setReady]=useState(false),[key,setKey]=useState(""),[recovery,setRecovery]=useState(""),[recipient,setRecipient]=useState(""),[quote,setQuote]=useState<Quote|null>(null),[payment,setPayment]=useState<Payment|null>(null),[error,setError]=useState(""),[loadError,setLoadError]=useState(""),[busy,setBusy]=useState(false),[wallet,setWallet]=useState(false);
  useEffect(()=>{
    const hash=new URLSearchParams(location.hash.slice(1));let saved=hash.get("key")??"";
    if(!saved){try{saved=localStorage.getItem(`local-order:${id}`)??JSON.parse(localStorage.getItem("shopinbit-orders-v1")??"[]").find((x:{id:string})=>x.id===id)?.accessKey??"";}catch{}}
    if(/^[a-f0-9]{64}$/.test(saved)){try{localStorage.setItem(`local-order:${id}`,saved);}catch{}setKey(saved);}
    let entered=hash.get("recipient");
    if(!entered){try{entered=localStorage.getItem(`local-recipient:${id}`);}catch{}}
    if(entered&&/^0x[\da-fA-F]{40}$/.test(entered))setRecipient(entered);
    if(location.hash)history.replaceState(null,"",location.pathname);
    setReady(true);
  },[id]);
  useEffect(()=>{
    if(!key)return;let active=true,inFlight=false;
    let timer:ReturnType<typeof setInterval>;
    async function refresh(){
      if(inFlight)return;inFlight=true;
      try{const r=await fetch(`/api/orders/${id}/local-payment`,{headers:{"x-order-key":key},cache:"no-store"}),data=await r.json();if(!r.ok)throw Error(data.error);
        if(active){setQuote(data.quote);setPayment(data.payment);setWallet(data.paymentMethod==="wallet");setLoadError("");
          if(["paid","refunded","failed","unavailable","review"].includes(data.payment?.status))clearInterval(timer);
        }
      }catch(e){if(active)setLoadError(e instanceof Error?e.message:"Could not load payment details");}finally{inFlight=false;}
    }
    timer=setInterval(refresh,5000);void refresh();return ()=>{active=false;clearInterval(timer);};
  },[id,key]);
  async function start(){
    if(!quote||busy)return;if(!recipientVerified){setError("Verify the merchant address in the Localine extension.");return;}setBusy(true);setError("");
    try{const r=await fetch(`/api/orders/${id}/local-payment`,{method:"POST",headers:{"Content-Type":"application/json","x-order-key":key},body:JSON.stringify({recipient:recipient.trim(),signature:quote.signature})}),data=await r.json();if(!r.ok)throw Error(data.error);setPayment(data.payment);}
    catch(e){setError(e instanceof Error?e.message:"Could not open card checkout");}finally{setBusy(false);}
  }
  const recipientVerified=Boolean(quote&&/^0x[\da-fA-F]{40}$/.test(recipient)&&recipient.toLowerCase()===quote.recipient.toLowerCase());
  useEffect(()=>{if(recipientVerified){try{localStorage.setItem(`local-recipient:${id}`,recipient);}catch{}}},[id,recipient,recipientVerified]);
  function restore(){try{const data=JSON.parse(recovery);if(data.id!==id||!/^[a-f0-9]{64}$/.test(data.accessKey))throw Error();localStorage.setItem(`local-order:${id}`,data.accessKey);setKey(data.accessKey);setError("");}catch{setError("Paste the recovery file for this invoice.");}}
  return <main className="local-checkout"><header><a className="local-checkout-brand" href="https://localine.vercel.app"><img src="/localine-logo.png" alt=""/>Localine</a><span className="testnet-pill">Monad Testnet</span></header><div className="local-card"><p className="eyebrow">LOCAL PAYMENT · TEST DEMO</p><h1>You pay in TRY.<br/>The merchant receives USDC.</h1><p className="muted">No wallet connection or MON required.</p>
    {!ready?<p>Loading invoice…</p>:!key?<section><label>Paste the recovery JSON for this invoice<textarea value={recovery} onChange={e=>setRecovery(e.target.value)}/></label><button className="primary" onClick={restore}>Open invoice</button></section>:!quote?<p>Loading invoice…</p>:<>
      <section className="local-invoice-summary" aria-label="Order summary"><div className="local-invoice-merchant"><div><span className="fine muted">Merchant</span><strong>ShopinBit demo</strong></div><span className="local-usdc-badge">USDC · Monad Testnet</span></div><div className="local-reference"><span>Payment reference <code>#{quote.orderId.slice(0,12).toUpperCase()}</code></span><span className="fine muted">Monad Testnet</span></div></section>
      <dl className="local-totals"><div><dt>Merchant receives</dt><dd>{(Number(quote.amount)/1e6).toFixed(2)} USDC</dd></div><div><dt>Demo exchange rate</dt><dd>1 USDC = 45 TRY</dd></div><div><dt>Order</dt><dd>{money(quote.baseMinor)}</dd></div><div><dt>Fee (2%)</dt><dd>{money(quote.feeMinor)}</dd></div><div className="local-total"><dt>Total card payment</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="fine muted">The USDC amount comes from the saved invoice. The fee is added to your total; the merchant receives the full USDC amount. Use test cards only.</p>
      {!payment&&!wallet?<section className="local-payment-confirm">{recipientVerified?<><div className="local-verified-recipient"><span>✓</span><div><strong>Merchant address verified</strong><p>The address you entered in the Localine extension matches this order.</p><code>{recipient.slice(0,8)}…{recipient.slice(-6)}</code></div></div><button type="button" className="primary local-payment-link" disabled={busy||quote.expiresAt<=Date.now()} onClick={()=>void start()}>{busy?"Preparing…":money(quote.totalMinor)+" · Continue to card payment"}</button></>:<div className="local-extension-required"><h2>Continue in the Localine extension</h2><p className="muted">Paste the merchant address from the store’s crypto checkout into the Localine extension and verify it. The extension will open local checkout.</p><a className="primary" href="/app">Return to store checkout</a><a className="local-install-link" href="https://localine.vercel.app/en/shoppers" target="_blank" rel="noreferrer">Extension installation guide ↗</a></div>}</section>:wallet?<p>Wallet payment was selected for this invoice. Create a new payment request to use local payment.</p>:payment?<section aria-live="polite"><h2>{labels[payment.status]??"Processing payment"}</h2>
        {payment.pageUrl?<a className="primary local-payment-link" href={payment.pageUrl} rel="noreferrer">Pay by card in iyzico sandbox ↗</a>:null}
        {payment.status==="awaiting_payment"?<p className="fine">Use test cards only. You will return to this page after card checkout. Test TROY card: <code>9792072000017956</code> · Expiry 12/30 · CVV 123.</p>:null}
        {payment.status==="review"?<p>Your invoice and reserved USDC are preserved. Do not start another payment until the result is confirmed.</p>:null}
        {payment.txHash?<a className="outline local-payment-link" href={`${EXPLORER}/tx/${payment.txHash}`} target="_blank" rel="noreferrer">View USDC transaction ↗</a>:null}
      </section>:null}
    </>}
    {error||loadError?<p className="status-message" role="alert">{error||loadError}</p>:null}<footer><a href="/app">Back to store</a><p className="fine muted">Independent ShopinBit demo. No real products or card charges.</p></footer></div></main>;
}
