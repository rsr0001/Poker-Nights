(() => {
 'use strict';
 const API = 'https://pokernights.duckdns.org';
 const root = document.createElement('section');
 root.id = 'accounts';
 root.className = 'panel account-panel';
 root.setAttribute('aria-label', 'Account and saved groups');
 document.querySelector('#app').before(root);
 const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token = '', user = null, groups = [], editing = null, config = null, busy = false;
 try { token = sessionStorage.getItem('poker-account-session') || ''; } catch {}
 function remember(value) { token = value; try { value ? sessionStorage.setItem('poker-account-session', value) : sessionStorage.removeItem('poker-account-session'); } catch {} }
 function message(text) { const node = root.querySelector('[role=status]'); if(node) node.textContent = text; }
 async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, credentials:'omit', signal:AbortSignal.timeout(15000), headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {}), ...options.headers} });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
   if (response.status === 401 && token) { remember(''); user=null; groups=[]; editing=null; draw(); }
   throw Error(data.error || 'Request failed. Please try again.');
  }
  return data;
 }
 function draw() {
  if(!user){
   root.innerHTML='<h2>Your regular table, ready to go</h2><p class="subtitle">Guest games always work. Sign in to save player groups and use them on another device.</p><div id="google-signin"></div><button class="secondary" data-account="signin">Sign in with Google</button><p class="account-status" role="status" aria-live="polite"></p>';
   if(config && !config.googleClientId){root.querySelector('[data-account=signin]').hidden=true;message('Accounts are being set up. You can keep playing as a guest.');}
   return;
  }
  root.innerHTML=`<div class="section-head account-heading"><div><div class="eyebrow">YOUR SAVED GROUPS</div><p class="subtitle">Signed in as ${escape(user.name)}</p></div><button class="secondary" data-account="logout">Sign out</button></div><p class="subtitle">Groups sync across devices. Games stay in this browser.</p><div class="group-list">${groups.map(g=>`<article class="group-card"><h3>${escape(g.name)}</h3><p>${g.players.length} players · ${(g.cash/100).toLocaleString('en-US',{style:'currency',currency:'USD'})} buys ${g.chips.toLocaleString()} chips</p><p class="group-names">${g.players.map(escape).join(', ')}</p><div class="actions"><button data-account="start" data-id="${g.id}">Start game</button><button class="secondary" data-account="edit" data-id="${g.id}">Edit</button><button class="secondary danger" data-account="delete" data-id="${g.id}">Delete</button></div></article>`).join('')||'<p>No saved groups yet. Add your regular players below.</p>'}</div><div class="actions"><button class="secondary" data-account="create">+ New group</button><button class="secondary" data-account="save-game">Save current table as a group</button></div><div id="group-editor"></div><p class="account-status" role="status" aria-live="polite"></p>`;
 }
 function editor(g={name:'',cash:2000,chips:10000,players:['Player 1','Player 2','Player 3','Player 4']}) {
  editing = g.id || null;
  root.querySelector('#group-editor').innerHTML=`<form id="save-group"><h3>${editing?'Edit group':'New group'}</h3><label>Group name<input name="name" maxlength="60" required value="${escape(g.name)}"></label><div class="fields"><label>Cash per buy-in ($)<input name="cash" type="number" min="0.01" max="100000" step="0.01" required value="${g.cash/100}"></label><label>Chips per buy-in<input name="chips" type="number" min="1" max="1000000000" step="1" required value="${g.chips}"></label></div><label>Players (one name per line)<textarea name="players" rows="5" maxlength="2100" required>${g.players.map(escape).join('\n')}</textarea></label><p class="subtitle">Use 1–50 different names, up to 40 characters each. Editing a group does not change an active game.</p><div class="actions"><button type="submit">Save group</button><button type="button" class="secondary" data-account="cancel">Cancel</button></div></form>`;
  root.querySelector('#save-group input').focus();
 }
 let googleScript;
 function loadGoogle() {
  if(window.google?.accounts?.id)return Promise.resolve();
  if(!googleScript)googleScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>{googleScript=null;script.remove();reject(Error('Google sign-in could not load. Check your connection or content blocker.'));};document.head.append(script);});
  return googleScript;
 }
 async function signin() {
  if(!config)config=await api('/config');
  if(!config.googleClientId)throw Error('Accounts are being set up. Guest games are available.');
  message('Loading Google sign-in…');
  await loadGoogle();
  const {nonce}=await api('/auth/challenge',{method:'POST',body:'{}'});
  window.google.accounts.id.initialize({client_id:config.googleClientId,nonce,auto_select:false,ux_mode:'popup',callback:async response=>{
   try {
    message('Signing in…');
    const result=await api('/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential,nonce})});
    remember(result.token);user=result.user;groups=(await api('/groups')).groups;draw();
   } catch(error){message(error.message);root.querySelector('[data-account=signin]')?.removeAttribute('hidden');}
  }});
  window.google.accounts.id.renderButton(root.querySelector('#google-signin'),{theme:'outline',size:'large',text:'signin_with',shape:'rectangular'});
  root.querySelector('[data-account=signin]').hidden=true;
  message('Continue with Google above. Sign-in expires after 12 hours; guest games stay saved.');
 }
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-account]');if(!button||busy)return;
  const action=button.dataset.account,g=groups.find(g=>g.id===button.dataset.id);
  busy=true;button.disabled=true;
  try {
   if(action==='signin')await signin();
   if(action==='logout'){await api('/auth/logout',{method:'POST',body:'{}'});remember('');user=null;groups=[];editing=null;window.google?.accounts.id.disableAutoSelect();draw();}
   if(action==='create')editor();
   if(action==='edit'&&g)editor(g);
   if(action==='cancel'){editing=null;root.querySelector('#group-editor').replaceChildren();}
   if(action==='save-game'){const snapshot=window.PokerGame.snapshot();if(!snapshot)throw Error('Start a guest game first, or create a new group.');editor({...snapshot,name:''});}
   if(action==='start'&&g)window.PokerGame.startFromGroup(g);
   if(action==='delete'&&g){confirmAction('Delete saved group?',`Delete ${g.name}? Your current game will stay saved.`,async()=>{try{await api('/groups/'+g.id,{method:'DELETE'});groups=groups.filter(item=>item.id!==g.id);draw();}catch(error){message(error.message);}});}
  } catch(error){message(error.message);}
  finally{busy=false;button.disabled=false;}
 });
 root.addEventListener('submit',async event=>{
  if(event.target.id!=='save-group')return;event.preventDefault();if(busy)return;
  const form=event.target,d=new FormData(form),players=String(d.get('players')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const body={name:String(d.get('name')).trim(),cash:Math.round(Number(d.get('cash'))*100),chips:Number(d.get('chips')),players};
  if(players.length<1||players.length>50||players.some(p=>p.length>40)||new Set(players.map(p=>p.toLowerCase())).size!==players.length){message('Use 1–50 different player names, up to 40 characters each.');return;}
  busy=true;form.querySelector('button').disabled=true;
  try {await api('/groups'+(editing?'/'+editing:''),{method:editing?'PUT':'POST',body:JSON.stringify(body)});groups=(await api('/groups')).groups;editing=null;draw();message('Group saved.');}
  catch(error){message(error.message);}
  finally{busy=false;form.querySelector('button').disabled=false;}
 });
 draw();
 (async()=>{try{config=await api('/config');if(token){user=(await api('/me')).user;groups=(await api('/groups')).groups;}draw();}catch(error){message('Saved groups are unavailable right now. Guest games still work. '+error.message);}})();
})();
