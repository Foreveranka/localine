import { CHAIN_ID, RPCS } from "./payment";
export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: Error | undefined;
  for (const url of RPCS) {
    try {
      const call = async (m: string, p: unknown[]) => {
        const response = await fetch(url, {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p}), signal: AbortSignal.timeout(12000)});
        if (!response.ok) throw new Error("Testnet provider unavailable.");
        const body = await response.json() as {error?: {message:string}; result: T};
        if (body.error) throw new Error(body.error.message);
        return body.result;
      };
      const chain = await call("eth_chainId", []);
      if (Number(BigInt(String(chain))) !== CHAIN_ID) throw new Error("RPC network mismatch.");
      return await call(method, params);
    } catch (e) {last = e instanceof Error ? e : new Error("RPC failed");}
  }
  throw last ?? new Error("Testnet unavailable");
}
