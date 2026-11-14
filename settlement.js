/* All money values are integer cents. */
(function(root){
function calculate(game, unit=1){
  const total=game.players.reduce((s,p)=>s+p.buys*game.cash,0);
  const rows=game.players.map(p=>({...p, invested:p.buys*game.cash, raw:Number(p.chips)*game.cash/game.chips}));
  const rawTotal=rows.reduce((s,p)=>s+p.raw,0);
  const difference=Math.round(rawTotal-total);
  rows.forEach(p=>{p.adjusted=p.raw;});
  // Deduct shortages from the biggest winners first; never make a payout negative.
  let excess=rawTotal-total;
  if(excess>0){
    [...rows].sort((a,b)=>(b.raw-b.invested)-(a.raw-a.invested)).forEach(p=>{const cut=Math.min(excess,p.adjusted);p.adjusted-=cut;excess-=cut;});
  }else if(excess<0){
    [...rows].sort((a,b)=>(b.raw-b.invested)-(a.raw-a.invested))[0].adjusted-=excess;
  }
  if(total%unit)throw new Error('The cash pot cannot be divided into this rounding unit. Choose a smaller unit.');
  rows.forEach(p=>{p.payout=Math.floor(p.adjusted/unit)*unit;});
  let remaining=Math.round((total-rows.reduce((s,p)=>s+p.payout,0))/unit);
  const ordered=[...rows].sort((a,b)=>(b.adjusted-b.payout)-(a.adjusted-a.payout));
  for(let i=0;i<remaining;i++)ordered[i%ordered.length].payout+=unit;
  rows.forEach(p=>{p.net=p.payout-p.invested;p.adjustment=p.payout-p.raw;});
  const creditors=rows.filter(p=>p.net>0).map(p=>({...p,left:p.net})).sort((a,b)=>b.left-a.left);
  const debtors=rows.filter(p=>p.net<0).map(p=>({...p,left:-p.net})).sort((a,b)=>b.left-a.left);
  const transfers=[];let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){const amount=Math.min(debtors[i].left,creditors[j].left);transfers.push({from:debtors[i].name,to:creditors[j].name,amount});debtors[i].left-=amount;creditors[j].left-=amount;if(!debtors[i].left)i++;if(!creditors[j].left)j++;}
  return {rows,transfers,total,difference,rawTotal};
}
if(typeof module!=='undefined')module.exports={calculate};else root.Poker={calculate};
})(globalThis);
