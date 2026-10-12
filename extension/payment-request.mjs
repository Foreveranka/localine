export const ORIGINS = ["https://shopinbit-monad.vercel.app", "http://127.0.0.1:4173"];
const TOKEN = "0x534b2f3a21130d7a60830c2df862319e593943a3";

export function allowedOrigin(url) {
  const parsed = new URL(url);
  if (parsed.username || parsed.password || !ORIGINS.includes(parsed.origin) || parsed.pathname !== "/app") {
    throw new Error("Yalnızca klon ShopinBit sitesinin ödeme ekranı destekleniyor.");
  }
  return parsed.origin;
}

export function validateRequest(value, invoiceId, now = Date.now()) {
  if (!value || value.version !== 1 || !/^[a-f0-9]{64}$/.test(invoiceId) || value.invoiceId !== invoiceId) {
    throw new Error("Fatura bilgisi uyuşmuyor.");
  }
  if (value.chainId !== 10143 || value.token?.toLowerCase() !== TOKEN || value.decimals !== 6 || value.symbol !== "USDC") {
    throw new Error("Bu ödeme Monad Testnet üzerindeki Circle USDC ile yapılmalı.");
  }
  if (value.status !== "unpaid" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) {
    throw new Error("Fatura ödendi veya süresi doldu. Yeni fatura oluştur.");
  }
  if (typeof value.amount !== "string" || !/^[1-9][0-9]{0,7}$/.test(value.amount) || BigInt(value.amount) > 15000000n) {
    throw new Error("Faturanın test USDC tutarı geçersiz.");
  }
  if (typeof value.recipient !== "string" || !/^0x[\da-fA-F]{40}$/.test(value.recipient) || /^0x0{40}$/i.test(value.recipient)) {
    throw new Error("Faturanın alıcı adresi geçersiz.");
  }
  const data = "0xa9059cbb" + value.recipient.slice(2).toLowerCase().padStart(64, "0") + BigInt(value.amount).toString(16).padStart(64, "0") + invoiceId;
  if (value.data !== data) throw new Error("Ödeme talimatı fatura ile uyuşmuyor.");
  return {invoiceId, chainId:10143, token:TOKEN, decimals:6, amount:value.amount, recipient:value.recipient, expiresAt:value.expiresAt, data};
}

export async function readPaymentRequest(checkout, fetcher = fetch) {
  const origin = allowedOrigin(checkout.url);
  if (!/^[a-f0-9]{64}$/.test(checkout.id) || !/^[a-f0-9]{64}$/.test(checkout.key)) throw new Error("Ödeme ekranında hazır fatura bulunamadı.");
  const response = await fetcher(`${origin}/api/orders/${checkout.id}/payment-request`, {
    headers:{"x-order-key":checkout.key}, cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(response.status === 410 ? "Fatura ödendi veya süresi doldu." : "Fatura sunucudan doğrulanamadı.");
  return validateRequest(await response.json(), checkout.id);
}

export function validateRecipient(request, entered) {
  const address = entered.trim();
  if (!/^0x[\da-fA-F]{40}$/.test(address)) throw new Error("Geçerli bir alıcı adresi yapıştır.");
  if (address.toLowerCase() !== request.recipient.toLowerCase()) throw new Error("Girdiğin adres bu faturanın alıcısıyla uyuşmuyor. İşlem durduruldu.");
  return address;
}

export function sameRequest(a, b) {
  return a.invoiceId === b.invoiceId && a.amount === b.amount && a.chainId === b.chainId && a.token === b.token && a.recipient.toLowerCase() === b.recipient.toLowerCase() && a.expiresAt === b.expiresAt && a.data === b.data;
}

export function formatAmount(amount) {
  const units = BigInt(amount);
  return `${units / 1000000n}.${(units % 1000000n).toString().padStart(6,"0").replace(/0+$/, "").padEnd(2,"0")}`;
}
