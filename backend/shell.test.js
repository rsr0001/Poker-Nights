import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
test('navigation preserves games and draft forms; group start returns to Table; account state gates history',async()=>{
 const dom=new JSDOM(await read('index.html'),{url:'https://rsr0001.github.io/Poker-Nights/',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.fetch=async()=>({ok:true,status:200,json:async()=>({googleClientId:null})});
 try{
  for(const name of ['settlement.js','app.js','history.js','groups.js','shell.js','pwa.js'])w.eval(await read(name));
  await flush();
  assert.equal(d.querySelectorAll('.app-view:not([hidden])').length,1);
  assert.equal(d.querySelector('#view-table').hidden,false);
  assert.equal(d.querySelector('#accounts').parentElement.id,'view-groups');
  assert.equal(d.querySelector('#game-history').parentElement.id,'view-history');
  assert.equal(d.querySelector('#refresh-app').closest('.app-view').id,'view-settings');
  d.querySelector('#setup [name=cash]').value='35';
  d.querySelector('[data-view=groups]').click();await flush();
  assert.equal(d.querySelector('#view-groups').hidden,false);assert.equal(d.querySelector('[data-view=groups]').getAttribute('aria-current'),'page');
  d.querySelector('[data-view=table]').click();await flush();assert.equal(d.querySelector('#setup [name=cash]').value,'35');
  d.querySelector('#setup').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const saved=w.localStorage.getItem('poker-nights-v1');
  d.querySelector('[data-view=history]').click();await flush();assert.equal(d.querySelector('#history-signin').hidden,false);
  assert.equal(w.localStorage.getItem('poker-nights-v1'),saved);
  w.dispatchEvent(new w.CustomEvent('poker:account-change',{detail:{name:'Alex'}}));assert.equal(d.querySelector('#history-signin').hidden,true);assert.equal(d.querySelector('#account-label').textContent,'Alex');
  w.dispatchEvent(new w.CustomEvent('poker:account-change',{detail:null}));assert.equal(d.querySelector('#history-signin').hidden,false);
  d.querySelector('[data-view=groups]').click();await flush();
  w.PokerGame.startFromGroup({name:'Friday',cash:2000,chips:10000,players:['Alex','Sam']});
  d.querySelector('#notice').returnValue='confirm';d.querySelector('#notice').onclose();await flush();
  assert.equal(w.location.hash,'#table');assert.equal(d.querySelector('#view-table').hidden,false);assert.equal(d.querySelectorAll('.player').length,2);
  w.location.hash='#unknown';await flush();assert.equal(d.querySelector('#view-table').hidden,false);
 }finally{dom.window.close();}
});
