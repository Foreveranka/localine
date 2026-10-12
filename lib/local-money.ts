// The sandbox quote is deliberately fixed, never presented as a live FX price.
export const DEMO_RATE = 45;
export const COMMISSION_BPS = 200;
export function quoteMoney(units: string) {
  if (!/^\d+$/.test(units) || BigInt(units)<=0n || BigInt(units)>15_000_000n) throw Error("Invalid invoice amount");
  const base = (BigInt(units)*4500n+999999n)/1000000n;
  const fee = (base*BigInt(COMMISSION_BPS)+9999n)/10000n;
  return {baseMinor:Number(base),feeMinor:Number(fee),totalMinor:Number(base+fee),rate:DEMO_RATE,commissionBps:COMMISSION_BPS};
}
export function decimalMinor(value: unknown): number | null {
  const s=String(value);
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))return null;
  const [whole,fraction=""]=s.split(".");
  return Number(BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0")));
}
export function priceString(minor:number){return (minor/100).toFixed(2);}
export function normalizedDecimal(value:unknown){
  const s=String(value);
  if(!/^\d+(?:\.\d+)?$/.test(s))throw Error("Invalid price");
  return s.includes(".")?s.replace(/0+$/,"").replace(/\.$/,""):s;
}
