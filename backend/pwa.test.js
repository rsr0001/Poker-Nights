import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = path => readFile(new URL('../'+path,import.meta.url),'utf8');
const flush = () => new Promise(resolve=>setTimeout(resolve,10));
test('install manifest and precache reference valid assets and correctly sized icons',async()=>{
 const manifest=JSON.parse(await read('manifest.webmanifest'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');
 for(const icon of [...manifest.icons,{src:'icons/apple-touch-icon.png',sizes:'180x180'}]){
  const buffer=await readFile(new URL('../'+icon.src,import.meta.url));
  assert.equal(buffer.readUInt32BE(16),Number(icon.sizes.split('x')[0]));
  assert.equal(buffer.readUInt32BE(20),Number(icon.sizes.split('x')[1]));
 }
 const handlers={},scope='https://rsr0001.github.io/Poker-Nights/';
 let assets;
 const context={URL,self:{registration:{scope},addEventListener:(event,fn)=>handlers[event]=fn},caches:{open:async()=>({addAll:async list=>{assets=list;}})}};
 vm.runInNewContext(await read('sw.js'),context);
 let job;handlers.install({waitUntil:promise=>job=promise});await job;
 const html=await read('index.html');
 for(const asset of assets){await readFile(new URL('../'+(asset==='./'?'index.html':asset.split('?')[0]),import.meta.url));}
 for(const [,url] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]+)?)"/g)){assert.ok(assets.includes('./'+url),'asset is cached: '+url);}
});
test('worker caches only app assets and leaves API, Google, and unrelated sites untouched',async()=>{
 const handlers={},scope='https://rsr0001.github.io/Poker-Nights/';
 const cacheResponse={body:'cached guest shell'};
 let activated=false,claimed=false;const removed=[];
 const context={URL,self:{registration:{scope},location:{origin:'https://rsr0001.github.io'},addEventListener:(event,fn)=>handlers[event]=fn,skipWaiting:()=>{activated=true;},clients:{claim:async()=>{claimed=true;}}},caches:{open:async()=>({match:async()=>cacheResponse}),keys:async()=>['another-project','poker-nights-old','poker-nights-app-2'],delete:async key=>removed.push(key)},fetch:()=>{throw Error('network unavailable');}};
 vm.runInNewContext(await read('sw.js'),context);
 for(const url of ['https://pokernights.duckdns.org/groups','https://accounts.google.com/gsi/client','https://rsr0001.github.io/Other/','https://rsr0001.github.io/Poker-Nights/README.md']){
  let intercepted=false;handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
 }
 let response;handlers.fetch({request:{url:scope+'?source=homescreen',method:'GET',mode:'navigate'},respondWith:promise=>response=promise});assert.equal(await response,cacheResponse);
 handlers.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(activated,true);
 let job;handlers.activate({waitUntil:promise=>job=promise});await job;
 assert.deepEqual(removed,['poker-nights-old']);assert.equal(claimed,true);
});
test('home-screen guidance, offline refresh, and explicit update activation preserve game data',async()=>{
 const dom=new JSDOM(await read('index.html'),{url:'https://rsr0001.github.io/Poker-Nights/',runScripts:'outside-only'}),w=dom.window;
 const listeners={};let message,checks=0;
 const registration={waiting:{postMessage:value=>message=value},update:async()=>{checks++;},addEventListener:()=>{}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>registration,addEventListener:(event,fn)=>listeners[event]=fn}});
 w.matchMedia=()=>({matches:false});
 w.localStorage.setItem('poker-nights-v1','saved-game');
 try {
  w.eval(await read('pwa.js'));await flush();
  const d=w.document;assert.match(d.querySelector('#app-update-status').textContent,/new version is ready/);
  d.querySelector('#install-app').click();await flush();assert.match(d.querySelector('#app-update-status').textContent,/browser menu/);
  Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
  d.querySelector('#refresh-app').click();await flush();assert.match(d.querySelector('#app-update-status').textContent,/offline/);assert.equal(message,undefined);
  Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true});
  d.querySelector('#refresh-app').click();await flush();assert.equal(message.type,'ACTIVATE_UPDATE');assert.ok(checks>=2);
  assert.equal(w.localStorage.getItem('poker-nights-v1'),'saved-game');
 }finally{dom.window.close();}
});
