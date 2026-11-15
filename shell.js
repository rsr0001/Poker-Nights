(() => {
 'use strict';
 const views={table:['LET’S PLAY','Your table','Buy in. Keep track. Settle up.'],groups:['YOUR REGULARS','Player groups','Your favorite people. Your usual game.'],history:['THE RECAP','Past games','Every night, down to the last chip.'],settings:['MAKE IT YOURS','The app','Install, refresh, and keep your game safe.']};
 document.querySelector('#view-groups').append(document.querySelector('#accounts'));
 document.querySelector('#view-history').append(document.querySelector('#game-history'));
 let active;
 function navigate(focus=false){
  const view=Object.hasOwn(views,location.hash.slice(1))?location.hash.slice(1):'table';
  for(const name of Object.keys(views))document.querySelector('#view-'+name).hidden=name!==view;
  for(const link of document.querySelectorAll('[data-view]')){
   if(link.dataset.view===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  const [kicker,title,description]=views[view];
  document.querySelector('#view-kicker').textContent=kicker;
  document.querySelector('#view-title').textContent=title;
  document.querySelector('#view-description').textContent=description;
  document.title=title+' · Poker Nights';
  if(active!==view&&focus){document.querySelector('#view-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  active=view;
 }
 window.addEventListener('hashchange',()=>navigate(true));
 window.addEventListener('poker:game-started',()=>{location.hash='table';});
 window.addEventListener('poker:account-change',event=>{
  const user=event.detail;
  document.querySelector('#account-label').textContent=user?user.name:'Sign in';
  document.querySelector('#history-signin').hidden=Boolean(user);
 });
 window.dispatchEvent(new Event('poker:account-request'));
 navigate();
})();
