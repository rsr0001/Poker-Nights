import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = name => readFile(new URL('../'+name,import.meta.url),'utf8');
const flush = () => new Promise(resolve=>setTimeout(resolve,20));
async function setup({offline=false}={}) {
 const dom=new JSDOM(await read('index.html'),{url:'https://rsr0001.github.io/Poker-Nights/',runScripts:'outside-only'});
 const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 let saved=[],googleCallback,logout=false;
 w.google={accounts:{id:{initialize:config=>{googleCallback=config.callback;},renderButton:node=>{node.textContent='Google button';},disableAutoSelect:()=>{}}}};
 w.fetch=async(url,options={})=>{
  if(offline)throw Error('offline');
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};
  let data={},status=200;
  if(path==='/config')data={googleClientId:'configured-client'};
  if(path==='/auth/challenge')data={nonce:'test-nonce'};
  if(path==='/auth/google')data={token:'test-session',user:{name:'Alex'}};
  if(path==='/groups'&&options.method==='POST'){data={group:{id:'test-id',...body}};saved.push(data.group);}
  else if(path==='/groups')data={groups:structuredClone(saved)};
  if(path==='/groups/test-id'&&options.method==='PUT'){saved[0]={id:'test-id',...body};data={group:saved[0]};}
  if(path==='/auth/logout'){logout=true;status=204;}
  return {ok:true,status,json:async()=>data};
 };
 for(const name of ['settlement.js','app.js','groups.js'])w.eval(await read(name));
 await flush();
 return {w,dom,login:async()=>{w.document.querySelector('[data-account=signin]').click();await flush();await googleCallback({credential:'verified-google-token'});await flush();},get saved(){return saved;},get logout(){return logout;}};
}
function submit(w,selector){w.document.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
test('guest game remains usable when account API is unavailable; chip arrows remain ±1',async()=>{
 const {w,dom}=await setup({offline:true});
 try {
  submit(w,'#setup');assert.equal(w.document.querySelectorAll('.player').length,4);
  w.document.querySelector('[data-action=end]').click();
  assert.equal(w.document.querySelector('.chips').step,'1');
  assert.match(w.document.querySelector('#accounts').textContent,/Guest games still work/);
 }finally{dom.window.close();}
});
test('sign in, save/edit group, copy into game, remove a player, and logout preserves guest game',async()=>{
 const state=await setup(),{w,dom}=state,d=w.document;
 try {
  await state.login();assert.match(d.querySelector('#accounts').textContent,/Signed in as Alex/);
  d.querySelector('[data-account=create]').click();
  d.querySelector('#save-group [name=name]').value='Friday';
  d.querySelector('#save-group [name=players]').value='Alex\nSam';
  submit(w,'#save-group');await flush();assert.deepEqual(state.saved[0].players,['Alex','Sam']);
  d.querySelector('[data-account=edit]').click();
  d.querySelector('#save-group [name=players]').value='Alex\nSam\nJo';
  submit(w,'#save-group');await flush();assert.equal(state.saved[0].players.length,3);
  d.querySelector('[data-account=start]').click();assert.equal(d.querySelectorAll('.player').length,3);
  const name=d.querySelector('[data-name]');name.value='Changed';name.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(state.saved[0].players[0],'Alex');
  d.querySelector('[data-action=remove]').click();
  const dialog=d.querySelector('#notice');dialog.returnValue='confirm';dialog.onclose();assert.equal(d.querySelectorAll('.player').length,2);
  assert.equal(state.saved[0].players.length,3);
  d.querySelector('[data-account=logout]').click();await flush();assert.equal(state.logout,true);
  assert.equal(w.sessionStorage.getItem('poker-account-session'),null);
  assert.equal(JSON.parse(w.localStorage.getItem('poker-nights-v1')).players.length,2);
 }finally{dom.window.close();}
});
