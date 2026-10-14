// Controller tests use mocked Chrome APIs; they are not an installed-extension browser test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const result=await build({entryPoints:['extension/popup.js'],bundle:true,write:false,format:'iife',platform:'browser'});
const code=result.outputFiles[0].text;
const invoiceId='a'.repeat(64),key='b'.repeat(64),recipient='0xd022B96bAB53BbBfFBD9D185F5E4A8c4A3B6C2F0';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({saved,geo=async()=>({ok:true,json:async()=>({language:'tr'})})}={}){
 const elements=new Map(),storage=new Map(saved?[['localine.language',saved]]:[]),created=[],calls=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});return elements.get(id);};
 const translatable=['read','confirm','localPay','recipientMismatch'].map(key=>({dataset:{i18n:key},textContent:''}));
 const state={id:invoiceId,key,url:'https://shopinbit-monad.vercel.app/app'};
 const request=()=>({version:1,invoiceId:state.id,chainId:10143,token:'0x534b2f3A21130d7a60830c2Df862319e593943A3',symbol:'USDC',decimals:6,amount:'2000000',recipient,expiresAt:2000000000000,status:'unpaid',data:'0xa9059cbb'+recipient.slice(2).toLowerCase().padStart(64,'0')+(2000000n).toString(16).padStart(64,'0')+state.id});
 const document={getElementById:element,documentElement:{lang:'en'},querySelectorAll:()=>translatable};
 const context=vm.createContext({document,chrome:{i18n:{getUILanguage:()=> 'en-US'},tabs:{query:async()=>[{id:1,url:state.url}],create:async value=>created.push(value)},scripting:{executeScript:async()=>[{result:{...state}}]}},navigator:{language:'en-US'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},fetch:async(url,options)=>{calls.push({url,options});return url.endsWith('/locale')?geo():{ok:true,json:async()=>request()};},URL,URLSearchParams,AbortSignal,Date,BigInt,Error,console});
 vm.runInContext(code,context);
 return {element,document,storage,created,calls,state,async event(id,name='click'){await element(id).listeners[name]({preventDefault(){}});await tick();}};
}
test('late IP detection cannot overwrite a manual selection; preference is remembered',async()=>{
 let resolveGeo;const pending=new Promise(resolve=>{resolveGeo=resolve;});const c=setup({geo:()=>pending});
 c.element('language').value='de';await c.event('language','change');
 resolveGeo({ok:true,json:async()=>({language:'fr'})});await tick();
 assert.equal(c.document.documentElement.lang,'de');assert.equal(c.storage.get('localine.language'),'de');
 const reopened=setup({saved:'de'});await tick();assert.equal(reopened.document.documentElement.lang,'de');assert.equal(reopened.calls.length,0);
});
test('language changes keep invoice and manual address checks intact',async()=>{
 const c=setup();await tick();assert.equal(c.document.documentElement.lang,'tr');
 await c.event('read');assert.equal(c.element('amount').textContent,'2.00 USDC');assert.equal(c.element('recipient').value,'');
 c.element('recipient').value=recipient;await c.event('confirm-form','submit');assert.equal(c.element('confirmed').hidden,false);
 c.element('language').value='es';await c.event('language','change');
 await c.event('local-pay');assert.equal(c.created.length,1);
 const target=new URL(c.created[0].url),hash=new URLSearchParams(target.hash.slice(1));
 assert.equal(target.origin,'https://shopinbit-monad.vercel.app');assert.equal(target.pathname,'/pay/'+invoiceId);assert.equal(hash.get('recipient'),recipient);assert.equal(hash.get('key'),key);assert.equal(hash.has('amount'),false);
});
test('recipient rejection remains visible and translates without opening a payment',async()=>{
 const c=setup({saved:'tr'});await tick();await c.event('read');c.element('recipient').value='0x'+'1'.repeat(40);await c.event('confirm-form','submit');
 assert.match(c.element('status').textContent,/uyuşmuyor/);assert.equal(c.created.length,0);
 c.element('language').value='fr';await c.event('language','change');assert.match(c.element('status').textContent,/correspond pas/);assert.equal(c.created.length,0);
});
test('changing the active invoice still prevents payment in any language',async()=>{
 const c=setup({saved:'de'});await tick();await c.event('read');c.element('recipient').value=recipient;c.state.id='c'.repeat(64);await c.event('confirm-form','submit');
 assert.match(c.element('status').textContent,/geändert/);assert.equal(c.created.length,0);
});
