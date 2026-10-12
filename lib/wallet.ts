import { CHAIN_ID, USDC, RPCS, EXPLORER } from "./payment";
export interface Provider {request(args:{method:string;params?:unknown[]}):Promise<unknown>;on?(event:string,listener:(value:unknown)=>void):void;removeListener?(event:string,listener:(value:unknown)=>void):void}
export interface WalletInfo {name:string;uuid:string;provider:Provider}
declare global {interface Window {ethereum?:Provider}}
export async function ensureNetwork(provider:Provider){
  const chain=await provider.request({method:"eth_chainId"});if(Number(BigInt(String(chain)))===CHAIN_ID)return;
  try{await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x279f"}]});}
  catch(e){if((e as {code?:number}).code!==4902)throw e;await provider.request({method:"wallet_addEthereumChain",params:[{chainId:"0x279f",chainName:"Monad Testnet",nativeCurrency:{name:"MON",symbol:"MON",decimals:18},rpcUrls:[RPCS[0]],blockExplorerUrls:[EXPLORER]}]});await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x279f"}]});}
  if(Number(BigInt(String(await provider.request({method:"eth_chainId"}))))!==CHAIN_ID)throw new Error("Switch your wallet to Monad Testnet.");
}
export async function balances(provider:Provider,address:string){
  const [usdc,gas]=await Promise.all([provider.request({method:"eth_call",params:[{to:USDC,data:"0x70a08231"+address.slice(2).padStart(64,"0")},"latest"]}),provider.request({method:"eth_getBalance",params:[address,"latest"]})]);
  return {usdc:BigInt(String(usdc)),gas:BigInt(String(gas))};
}
