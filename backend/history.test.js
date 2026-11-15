import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { completedGame } from './history.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
const example=()=>({id:'550e8400-e29b-41d4-a716-446655440000',title:'Friday',cash:2000,chips:10000,unit:1,created:'2026-01-01T01:00:00Z',completedAt:'2026-01-01T03:00:00Z',players:[{name:'Alex',buys:1,chips:15000},{name:'Sam',buys:1,chips:5000}]});
test('history validates complete snapshots and computes payouts from canonical settlement rules',()=>{
 const {result}=completedGame(example());assert.equal(result.total,4000);assert.equal(result.rows[0].net,1000);
 for(const patch of [{players:[]},{unit:3},{completedAt:'invalid'},{completedAt:'2025-01-01'},{cash:0},{title:' '},{players:[{name:'A',buys:1,chips:''}]},{players:[{name:'A',buys:1,chips:1},{name:'a',buys:1,chips:1}]}])assert.throws(()=>completedGame({...example(),...patch}));
 const mismatch=completedGame({...example(),players:[{name:'Alex',buys:1,chips:16000},{name:'Sam',buys:1,chips:5000}]}).result;
 assert.equal(mismatch.difference,200);assert.equal(mismatch.rows[0].payout,3000);
});
async function setup(){
 const dom=new JSDOM(await read('index.html'),{url:'https://rsr0001.github.io/Poker-Nights/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const name of ['settlement.js','app.js','history.js'])w.eval(await read(name));
 const calls=[],records=new Map();let offline=false,account='alice';
 const api=async(path,options={})=>{
  if(offline)throw Error('Offline');
  if(options.method==='PUT'){
   const value=JSON.parse(options.body),{game,result}=completedGame(value);calls.push({account,value});records.set(account+value.id,{id:value.id,snapshot:game,result});return {saved:true};
  }
  if(path.startsWith('/history?'))return {games:[...records.values()].filter(g=>records.get(account+g.id)===g).map(g=>({id:g.id,title:g.snapshot.title,completed_at:g.snapshot.completedAt,total:g.result.total,player_count:g.snapshot.players.length})),hasMore:false};
  return {game:records.get(account+path.split('/').pop())};
 };
 return {w,dom,calls,records,api,set offline(value){offline=value;},signIn(name){account=name;w.PokerHistory.setAccount({id:name},api);}};
}
test('completing a signed-in game saves history; recount updates same game; details include payouts',async()=>{
 const state=await setup(),{w,dom}=state,d=w.document;
 try{
  state.signIn('alice');await flush();
  d.querySelector('#setup [name=count]').value='2';d.querySelector('#setup').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  d.querySelector('[data-action=end]').click();
  for(const [i,input]of[...d.querySelectorAll('.chips')].entries()){input.value=String(i===0?15000:5000);input.dispatchEvent(new w.Event('input',{bubbles:true}));}
  d.querySelector('[data-action=settle]').click();await flush();
  assert.equal(state.calls.length,1);const id=state.calls[0].value.id;
  assert.equal(JSON.parse(w.localStorage.getItem('poker-nights-v1')).gameId,id);
  assert.equal(d.querySelectorAll('.history-game').length,1);
  const details=d.querySelector('.history-game');details.open=true;await flush();
  assert.match(details.textContent,/Player payouts/);assert.match(details.textContent,/\$30.00/);assert.match(details.textContent,/Player 2 → Player 1/);
  d.querySelector('[data-action=recount]').click();d.querySelector('[data-action=settle]').click();await flush();
  assert.equal(state.calls.length,2);assert.equal(state.calls[1].value.id,id);assert.equal(state.records.size,1);
 }finally{dom.window.close();}
});
test('offline queue persists, retries idempotently, and stays with its original account',async()=>{
 const state=await setup(),{w,dom}=state;
 try{
  state.signIn('alice');await flush();state.offline=true;
  w.dispatchEvent(new w.CustomEvent('poker:completed',{detail:example()}));await flush();
  assert.equal(JSON.parse(w.localStorage.getItem('poker-history-pending-alice')).length,1);
  w.PokerHistory.setAccount(null,state.api);assert.equal(w.document.querySelector('#game-history').hidden,true);
  state.offline=false;state.signIn('bob');await flush();assert.equal(state.calls.length,0);
  state.signIn('alice');await flush();assert.equal(state.calls.length,1);assert.equal(state.calls[0].account,'alice');
  assert.equal(JSON.parse(w.localStorage.getItem('poker-history-pending-alice')).length,0);
 }finally{dom.window.close();}
});
