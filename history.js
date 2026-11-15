(() => {
 'use strict';
 const root=document.createElement('section');root.id='game-history';root.className='panel';root.hidden=true;
 root.setAttribute('aria-label','Past games');document.querySelector('#app').after(root);
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>(Number(value)/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
 const date=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
 let user=null,request=null,games=[],hasMore=false,loading=false,syncing=false,pending=[],status='',volatile=false;
 const key=id=>'poker-history-pending-'+id;
 function store(){try{localStorage.setItem(key(user.id),JSON.stringify(pending));volatile=false;}catch{volatile=true;}}
 function draw(){
  root.hidden=!user;if(!user){root.replaceChildren();return;}
  root.innerHTML=`<div class="section-head account-heading"><div><div class="eyebrow">YOUR ACCOUNT</div><h2>Past games</h2></div><button class="secondary" data-history="refresh">Refresh history</button></div><p class="subtitle">Completed nights and payout details, saved to your account. Recounting a game updates its existing entry.</p><p class="history-status" role="status" aria-live="polite">${escape(status)}${pending.length?` ${pending.length} game${pending.length===1?'':'s'} waiting to sync.`:''}${volatile?' Keep this app open until syncing finishes; browser storage is unavailable.':''}</p><div class="actions"><button class="secondary" data-history="save-current">Save completed game</button>${pending.length?'<button class="secondary" data-history="retry">Retry sync</button>':''}</div><div class="history-list">${games.map(g=>`<details class="history-game" data-id="${escape(g.id)}"><summary><strong>${escape(g.title)}</strong><span>${escape(date(g.completed_at))} · ${g.player_count} players · ${money(g.total)} pot</span></summary><div class="history-details">Open to load payout details.</div></details>`).join('')||'<p class="empty">No completed games saved yet. Finish a game while signed in to save it here.</p>'}</div>${hasMore?'<button class="secondary wide" data-history="more">Load older games</button>':''}`;
 }
 async function load(more=false){
  if(!user)return;const owner=user.id,version=loading=Number(loading)+1;
  try{const data=await request('/history?offset='+(more?games.length:0));if(user?.id!==owner||loading!==version)return;games=more?[...games,...data.games]:data.games;hasMore=data.hasMore;status='';draw();}
  catch(error){if(user?.id===owner&&loading===version){status='Could not load history. '+error.message;draw();}}
 }
 async function sync(){
  if(!user||syncing===user.id||!pending.length)return;const owner=user.id;syncing=owner;
  try{
   while(user?.id===owner&&pending.length){
    const item=pending[0];
    await request('/history/'+item.id,{method:'PUT',body:JSON.stringify(item)});
    if(user?.id!==owner)return;
    // A recount can replace this snapshot while the previous request is in flight.
    if(pending[0]===item)pending.shift();store();status='Game saved to your history.';draw();
   }
   if(user?.id===owner)await load();
  }catch(error){if(user?.id===owner){status='History not synced yet. '+error.message;draw();}}
  finally{if(syncing===owner)syncing=false;}
 }
 function queue(game){
  if(!user||!game)return;
  const index=pending.findIndex(item=>item.id===game.id);
  const item=JSON.parse(JSON.stringify(game));if(index<0)pending.push(item);else pending[index]=item;
  store();status='Saving completed game…';draw();sync();
 }
 function details(saved){
  const {snapshot:g,result:r}=saved;
  return `<p>${escape(date(g.completedAt))} · ${money(g.cash)} buys ${g.chips.toLocaleString()} chips · rounded to ${money(g.unit)}</p>${r.difference?`<p class="warning">Chip mismatch adjustment: ${r.difference>0?'excess payout deducted from the biggest winner first':'unclaimed cash assigned to the biggest winner'}. Adjustments are included below.</p>`:''}<div class="history-table-wrap"><table class="history-table"><caption>Player payouts</caption><thead><tr><th>Player</th><th>Buy-ins</th><th>Final chips</th><th>Invested</th><th>Cash out</th><th>Profit / loss</th><th>Adjustment</th></tr></thead><tbody>${r.rows.map(p=>`<tr><th scope="row">${escape(p.name)}</th><td>${p.buys}</td><td>${p.chips.toLocaleString()}</td><td>${money(p.invested)}</td><td>${money(p.payout)}</td><td class="${p.net>=0?'positive':'negative'}">${money(p.net)}</td><td>${money(p.adjustment)}</td></tr>`).join('')}</tbody></table></div><h3>Who pays whom</h3><p class="subtitle">Suggested transfers if buy-ins were not collected. Otherwise pay the cash-out amounts from the central pot. This records the calculated settlement, not confirmation of payment.</p>${r.transfers.length?r.transfers.map(t=>`<div class="transfer"><span>${escape(t.from)} → ${escape(t.to)}</span><strong>${money(t.amount)}</strong></div>`).join(''):'<p>Everyone broke even. No transfers needed.</p>'}`;
 }
 root.addEventListener('toggle',async event=>{
  const item=event.target;if(!item.matches?.('.history-game')||!item.open||item.dataset.loaded)return;
  const owner=user?.id,node=item.querySelector('.history-details');node.textContent='Loading payout details…';
  try{const data=await request('/history/'+item.dataset.id);if(user?.id!==owner)return;node.innerHTML=details(data.game);item.dataset.loaded='true';}
  catch(error){if(user?.id===owner)node.textContent='Could not load details. Close and reopen this game to retry. '+error.message;}
 },true);
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-history]');if(!button)return;
  if(button.dataset.history==='more')await load(true);
  if(button.dataset.history==='refresh'){await load();await sync();}
  if(button.dataset.history==='retry')await sync();
  if(button.dataset.history==='save-current'){
   const game=window.PokerGame.completed();
   if(game)queue(game);else{status='Complete the current game by calculating its settlement first.';draw();}
  }
 });
 window.PokerHistory={setAccount(value,api){
  if(value?.id===user?.id)return;
  user=value;request=api;games=[];hasMore=false;status='';pending=[];volatile=false;
  if(user){try{const stored=JSON.parse(localStorage.getItem(key(user.id))||'[]');if(Array.isArray(stored))pending=stored.filter(g=>g&&typeof g.id==='string');}catch{status='Could not read pending history from this device.';}}
  draw();if(user){load();sync();}
 }};
 window.addEventListener('poker:completed',event=>queue(event.detail));
 window.addEventListener('online',()=>sync());
 window.addEventListener('focus',()=>sync());
})();
