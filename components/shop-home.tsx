"use client";
import { useState } from "react";
import { CATALOG } from "@/lib/payment";
export default function Home(){
  const [light,setLight]=useState(false),[tr,setTr]=useState(false);
  const t=(en:string,tu:string)=>tr?tu:en;
  return <div className={light?"site light":"site"}>
    <div className="demo-strip">{t("Independent reference demo · Monad Testnet · No real purchases","Bağımsız referans demo · Monad Testnet · Gerçek alışveriş yapılmaz")}</div>
    <header className="home-nav"><a className="wordmark" href="/">ShopinBit</a><nav aria-label="Main navigation"><a href="/app?service=goods">Concierge</a><a href="/app?service=travel">Travel</a><a href="/app?service=cars">Cars</a><a href="/app?service=goods&b2b=1">For Businesses – B2B</a><a href="#about">About us</a></nav><div className="nav-options"><select aria-label="Language" value={tr?"tr":"en"} onChange={e=>setTr(e.target.value==="tr")}><option value="en">English</option><option value="tr">Türkçe</option></select><button className="theme-switch" onClick={()=>setLight(!light)} aria-label="Toggle theme">☀ <span className="switch-knob"/> ☾</button></div></header>
    <main><section className="hero"><div className="hero-inner"><p className="eyebrow">SHOPINBIT – CRYPTO CONCIERGE</p><h1>{t("Live the good life with crypto.","Kriptoyla hayatın tadını çıkar.")}</h1><p className="hero-description">{t("Buy cars, travel, and goods with crypto, globally. Now with USDC on Monad Testnet.","Ürün, araç ve seyahat için kriptoyla ödeme yap. Şimdi Monad Testnet üzerinde USDC ile.")}</p><div className="button-row"><a className="primary" href="/app">{t("Start your request","Talebini oluştur")}</a><a className="outline" href="#how-it-works">{t("How it works","Nasıl çalışır")}</a></div></div></section>
    <section className="home-section"><h2>{t("Why clients choose ShopinBit","Neden ShopinBit?")}</h2><div className="feature-grid">{[
      ["No barriers","Hızlı başlangıç","No app downloads. Start directly in your browser.","Uygulama indirmeden tarayıcından başla."],
      ["The same experience","Aynı deneyim","Concierge, travel and cars — the familiar ShopinBit flow.","Concierge, seyahat ve araçlar — ShopinBit’in alışılmış akışı."],
      ["USDC payments","USDC ödemeleri","Pay from your wallet on Monad Testnet.","Monad Testnet üzerinde cüzdanınla öde."],
      ["Global requests","Global talepler","Describe what you need and where you need it.","İhtiyacını ve hedef ülkeni belirt."],
      ["Clear test pricing","Açık test fiyatları","Test quotes start at 1 USDC. No real goods are sold.","Test teklifler 1 USDC’den başlar. Gerçek ürün satılmaz."],
      ["Verified settlement","Doğrulanan ödeme","A payment is confirmed only after onchain verification.","Ödeme yalnızca zincirde doğrulandıktan sonra onaylanır."],
    ].map((f,i)=><article className="feature" key={f[0]}><span className="number">0{i+1}</span><h3>{t(f[0],f[1])}</h3><p>{t(f[2],f[3])}</p></article>)}</div></section>
    <section className="home-section" id="services"><p className="eyebrow">WHAT WE DO</p><h2>{t("Bespoke services","Sana özel hizmetler")}</h2><p className="section-lead">{t("Goods, travel, and cars. Make a request and explore the complete payment experience.","Ürünler, seyahat ve araçlar. Talep oluştur ve ödeme deneyimini dene.")}</p><div className="service-grid">{CATALOG.map(c=><a className="service-card" key={c.id} href={"/app?service="+c.id}><img src={c.image} alt={c.service} loading="lazy"/><div><h3>{c.service}</h3><p>{c.description}</p><span>{t("Start request","Talep oluştur")} ↗</span></div></a>)}</div></section>
    <section className="home-section" id="how-it-works"><h2>{t("A simple request. An onchain payment.","Basit bir talep. Zincir üzerinde ödeme.")}</h2><div className="feature-grid three">{[
      ["Describe your request","Talebini anlat","Choose a service and tell us what you need.","Hizmet seç ve ihtiyacını belirt."],
      ["Review the test quote","Test teklifini incele","See the full amount in test USDC before you pay.","Ödemeden önce test USDC tutarını gör."],
      ["Pay on Monad","Monad üzerinde öde","Connect your wallet and confirm your USDC transfer.","Cüzdanını bağla ve USDC transferini onayla."],
    ].map((f,i)=><article className="feature" key={f[0]}><span className="number">{i+1}</span><h3>{t(f[0],f[1])}</h3><p>{t(f[2],f[3])}</p></article>)}</div></section>
    <section className="home-section closing" id="about"><p className="eyebrow">SHOPINBIT · MONAD TESTNET</p><h2>{t("Make the request. Pay with USDC.","Talebini oluştur. USDC ile öde.")}</h2><p>{t("An independent testnet adaptation of ShopinBit’s website and request flow. Not affiliated with ShopinBit EU.","ShopinBit sitesi ve talep akışının bağımsız testnet uyarlaması. ShopinBit EU ile bağlantılı değildir.")}</p><a className="primary" href="/app">{t("Start now","Başla")}</a></section>
    </main><footer className="home-footer"><div><strong>ShopinBit</strong><p>Monad Testnet · USDC</p></div><p>Independent demo. Test tokens have no monetary value.<br/>Design reference: <a href="https://shopinbit.com/" target="_blank" rel="noreferrer">shopinbit.com ↗</a></p><a href="/app">Start request ↗</a></footer>
  </div>;
}
