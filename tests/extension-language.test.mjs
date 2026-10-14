import assert from 'node:assert/strict';
import {test} from 'node:test';
import {languages,messages,translate,browserLanguage,detectLanguage,paymentError,localizeError} from '../extension/i18n.mjs';
import middleware from '../website/middleware.js';

test('all five popup languages cover every UI and error message',()=>{
 const keys=Object.keys(messages.en).sort();
 assert.deepEqual(Object.keys(languages).sort(),['de','en','es','fr','tr']);
 for(const language of Object.keys(languages)){
  assert.deepEqual(Object.keys(messages[language]).sort(),keys);
  for(const key of keys)assert.ok(typeof translate(language,key)==='string'&&translate(language,key).length>0);
  assert.equal(localizeError(paymentError('recipientMismatch'),language),messages[language].recipientMismatch);
  assert.equal(localizeError(Error('untrusted raw text'),language),messages[language].readFailed);
 }
});

test('IP lookup only requests language and sends no invoice credentials',async()=>{
 let calls=0;
 const result=await detectLanguage(async(url,options)=>{
  calls++;assert.equal(url,'https://localine.vercel.app/locale');
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.cache,'no-store');assert.equal(options.headers,undefined);assert.equal(options.body,undefined);assert.ok(options.signal instanceof AbortSignal);
  return Response.json({language:'es'});
 },'tr-TR');
 assert.deepEqual(result,{language:'es',source:'detected'});assert.equal(calls,1);
});

test('unavailable or malformed lookup falls back to a supported browser language',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>Response.json({language:'__proto__'}),async()=>Response.json({language:'pt'}),async()=>new Response('unavailable',{status:503}),async()=>new Response('not json')]){
  assert.deepEqual(await detectLanguage(fetcher,'fr-FR'),{language:'fr',source:'fallback'});
 }
 assert.equal(browserLanguage('de-DE'),'de');assert.equal(browserLanguage('pt-BR'),'en');
});

test('public language endpoint returns country-selected language without IP or cookies',async()=>{
 for(const [country,language] of [['TR','tr'],['FR','fr'],['DE','de'],['PE','es'],['BR','en'],['','en']]){
  const response=middleware(new Request('https://localine.example/locale',{headers:{'x-vercel-ip-country':country,cookie:'localine_lang=fr'}}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{language});
  assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
 const response=middleware(new Request('https://localine.example/',{headers:{'x-vercel-ip-country':'TR',cookie:'localine_lang=de'}}));
 assert.equal(new URL(response.headers.get('location')).pathname,'/de/');
});
