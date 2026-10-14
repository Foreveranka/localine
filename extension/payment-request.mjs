import {paymentError} from "./i18n.mjs";
export const ORIGINS = ["https://shopinbit-monad.vercel.app", "http://127.0.0.1:4173"];
const TOKEN = "0x534b2f3a21130d7a60830c2df862319e593943a3";

export function allowedOrigin(url) {
  const parsed = new URL(url);
  if (parsed.username || parsed.password || !ORIGINS.includes(parsed.origin) || parsed.pathname !== "/app") {
    throw paymentError("unsupportedOrigin");
  }
  return parsed.origin;
}

export function validateRequest(value, invoiceId, now = Date.now()) {
  if (!value || value.version !== 1 || !/^[a-f0-9]{64}$/.test(invoiceId) || value.invoiceId !== invoiceId) {
    throw paymentError("invoiceMismatch");
  }
  if (value.chainId !== 10143 || value.token?.toLowerCase() !== TOKEN || value.decimals !== 6 || value.symbol !== "USDC") {
    throw paymentError("wrongNetwork");
  }
  if (value.status !== "unpaid" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) {
    throw paymentError("invoiceUnavailable");
  }
  if (typeof value.amount !== "string" || !/^[1-9][0-9]{0,7}$/.test(value.amount) || BigInt(value.amount) > 15000000n) {
    throw paymentError("invalidAmount");
  }
  if (typeof value.recipient !== "string" || !/^0x[\da-fA-F]{40}$/.test(value.recipient) || /^0x0{40}$/i.test(value.recipient)) {
    throw paymentError("invalidInvoiceRecipient");
  }
  const data = "0xa9059cbb" + value.recipient.slice(2).toLowerCase().padStart(64, "0") + BigInt(value.amount).toString(16).padStart(64, "0") + invoiceId;
  if (value.data !== data) throw paymentError("instructionsMismatch");
  return {invoiceId, chainId:10143, token:TOKEN, decimals:6, amount:value.amount, recipient:value.recipient, expiresAt:value.expiresAt, data};
}

export async function readPaymentRequest(checkout, fetcher = fetch) {
  const origin = allowedOrigin(checkout.url);
  if (!/^[a-f0-9]{64}$/.test(checkout.id) || !/^[a-f0-9]{64}$/.test(checkout.key)) throw paymentError("invoiceNotReady");
  const response = await fetcher(`${origin}/api/orders/${checkout.id}/payment-request`, {
    headers:{"x-order-key":checkout.key}, cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw paymentError(response.status === 410 ? "invoiceUnavailable" : "invoiceFetchFailed");
  return validateRequest(await response.json(), checkout.id);
}

export function validateRecipient(request, entered) {
  const address = entered.trim();
  if (!/^0x[\da-fA-F]{40}$/.test(address)) throw paymentError("invalidRecipient");
  if (address.toLowerCase() !== request.recipient.toLowerCase()) throw paymentError("recipientMismatch");
  return address;
}

export function sameRequest(a, b) {
  return a.invoiceId === b.invoiceId && a.amount === b.amount && a.chainId === b.chainId && a.token === b.token && a.recipient.toLowerCase() === b.recipient.toLowerCase() && a.expiresAt === b.expiresAt && a.data === b.data;
}

export function formatAmount(amount) {
  const units = BigInt(amount);
  return `${units / 1000000n}.${(units % 1000000n).toString().padStart(6,"0").replace(/0+$/, "").padEnd(2,"0")}`;
}
