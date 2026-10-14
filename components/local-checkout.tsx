"use client";
import {useEffect,useState} from "react";
import {EXPLORER} from "@/lib/payment";
type Quote={orderId:string;amount:string;recipient:string;chainId:number;expiresAt:number;baseMinor:number;feeMinor:number;totalMinor:number;rate:number;commissionBps:number;signature:string};
type Payment={status:string;pageUrl:string|null;txHash:string|null;issue:string|null};
const money=(minor:number)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(minor/100);
const labels:Record<string,string>={preparing:"Fatura havuza kaydediliyor",reserving:"Satıcının USDC’si ayrılıyor",initialize_ready:"Kart ödeme ekranı hazırlanıyor",initializing:"Kart ödeme ekranı hazırlanıyor",awaiting_payment:"Kart ödemen bekleniyor",captured:"Kart ödemen doğrulandı. USDC satıcıya gönderiliyor",refund_required:"USDC gönderilemedi. Kart iadesi hazırlanıyor",refunding:"Kart iadesi işleniyor",release_pending:"Ödeme sonucu kaydediliyor",cancel_pending:"Ödeme sonucu kaydediliyor",failed:"Kart ödemesi tamamlanmadı",refunded:"Kart ödemesi iade edildi",unavailable:"Bu sipariş için ödeme şu an açılamıyor",review:"Ödeme sonucu kontrol edilmeli. Yeniden ödeme yapma",paid:"Ödeme tamamlandı"};
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
      }catch(e){if(active)setLoadError(e instanceof Error?e.message:"Bilgiler alınamadı");}finally{inFlight=false;}
    }
    timer=setInterval(refresh,5000);void refresh();return ()=>{active=false;clearInterval(timer);};
  },[id,key]);
  async function start(){
    if(!quote||busy)return;if(!recipientVerified){setError("Satıcı adresini Localine eklentisinde doğrula.");return;}setBusy(true);setError("");
    try{const r=await fetch(`/api/orders/${id}/local-payment`,{method:"POST",headers:{"Content-Type":"application/json","x-order-key":key},body:JSON.stringify({recipient:recipient.trim(),signature:quote.signature})}),data=await r.json();if(!r.ok)throw Error(data.error);setPayment(data.payment);}
    catch(e){setError(e instanceof Error?e.message:"Ödeme açılamadı");}finally{setBusy(false);}
  }
  const recipientVerified=Boolean(quote&&/^0x[\da-fA-F]{40}$/.test(recipient)&&recipient.toLowerCase()===quote.recipient.toLowerCase());
  useEffect(()=>{if(recipientVerified){try{localStorage.setItem(`local-recipient:${id}`,recipient);}catch{}}},[id,recipient,recipientVerified]);
  function restore(){try{const data=JSON.parse(recovery);if(data.id!==id||!/^[a-f0-9]{64}$/.test(data.accessKey))throw Error();localStorage.setItem(`local-order:${id}`,data.accessKey);setKey(data.accessKey);setError("");}catch{setError("Bu faturanın kurtarma dosyasını yapıştır.");}}
  return <main className="local-checkout"><header><a className="local-checkout-brand" href="https://localine.vercel.app"><img src="/localine-logo.png" alt=""/>Localine</a><span className="testnet-pill">Monad Testnet</span></header><div className="local-card"><p className="eyebrow">YEREL ÖDEME · TEST DEMO</p><h1>Sen TL ile öde.<br/>Satıcı USDC alsın.</h1><p className="muted">Cüzdan bağlamana ve MON edinmene gerek yok.</p>
    {!ready?<p>Fatura yükleniyor…</p>:!key?<section><label>Bu faturanın kurtarma JSON’unu yapıştır<textarea value={recovery} onChange={e=>setRecovery(e.target.value)}/></label><button className="primary" onClick={restore}>Faturayı aç</button></section>:!quote?<p>Fatura yükleniyor…</p>:<>
      <section className="local-invoice-summary" aria-label="Sipariş özeti"><div className="local-invoice-merchant"><div><span className="fine muted">Ödeme yapılan mağaza</span><strong>ShopinBit demo</strong></div><span className="local-usdc-badge">USDC · Monad Testnet</span></div><div className="local-reference"><span>Ödeme referansı <code>#{quote.orderId.slice(0,12).toUpperCase()}</code></span><span className="fine muted">Monad Testnet</span></div></section>
      <dl className="local-totals"><div><dt>Satıcıya gidecek</dt><dd>{(Number(quote.amount)/1e6).toFixed(2)} USDC</dd></div><div><dt>Demo kuru</dt><dd>1 USDC = 45 TL</dd></div><div><dt>Sipariş</dt><dd>{money(quote.baseMinor)}</dd></div><div><dt>Komisyon (%2)</dt><dd>{money(quote.feeMinor)}</dd></div><div className="local-total"><dt>Karttan ödenecek</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="fine muted">USDC tutarı kayıtlı faturadan alınır. Komisyon sana eklenir; satıcının tutarından düşmez. Gerçek kart kullanma.</p>
      {!payment&&!wallet?<section className="local-payment-confirm">{recipientVerified?<><div className="local-verified-recipient"><span>✓</span><div><strong>Satıcı adresi doğrulandı</strong><p>Localine eklentisinde girdiğin adres bu siparişle eşleşiyor.</p><code>{recipient.slice(0,8)}…{recipient.slice(-6)}</code></div></div><button type="button" className="primary local-payment-link" disabled={busy||quote.expiresAt<=Date.now()} onClick={()=>void start()}>{busy?"Hazırlanıyor…":money(quote.totalMinor)+" · Kart ödemesine devam et"}</button></>:<div className="local-extension-required"><h2>Localine eklentisinden devam et</h2><p className="muted">Mağazanın ödeme ekranındaki satıcı adresini Localine eklentisine yapıştır ve doğrula. Yerel ödeme ekranı eklentiden açılacak.</p><a className="primary" href="/app">Mağazanın ödeme ekranına dön</a><a className="local-install-link" href="https://localine.vercel.app/tr/shoppers" target="_blank" rel="noreferrer">Eklenti kurulum rehberi ↗</a></div>}</section>:wallet?<p>Bu fatura için cüzdan ödemesi seçilmiş. Yeni bir taleple yerel ödeme başlatabilirsin.</p>:payment?<section aria-live="polite"><h2>{labels[payment.status]??"Ödeme işleniyor"}</h2>
        {payment.pageUrl?<a className="primary local-payment-link" href={payment.pageUrl} rel="noreferrer">iyzico sandbox’ta kart ile öde ↗</a>:null}
        {payment.status==="awaiting_payment"?<p className="fine">Yalnızca test kartı kullan. Kart işlemi sonrası bu sayfaya döneceksin. Test Troy kartı: <code>9792072000017956</code> · SKT 12/30 · CVV 123.</p>:null}
        {payment.status==="review"?<p>Fatura kaydın ve ayrılmış USDC korunuyor. Sonuç netleşmeden başka bir ödeme başlatma.</p>:null}
        {payment.txHash?<a className="outline local-payment-link" href={`${EXPLORER}/tx/${payment.txHash}`} target="_blank" rel="noreferrer">USDC gönderimini görüntüle ↗</a>:null}
      </section>:null}
    </>}
    {error||loadError?<p className="status-message" role="alert">{error||loadError}</p>:null}<footer><a href="/app">Mağazaya dön</a><p className="fine muted">Bağımsız ShopinBit demo. Gerçek ürün veya kart ödemesi yok.</p></footer></div></main>;
}
