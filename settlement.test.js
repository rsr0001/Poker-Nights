const {test}=require('node:test');const assert=require('node:assert/strict');const {calculate}=require('./settlement.js');
const game=chips=>({cash:2000,chips:10000,players:chips.map((c,i)=>({name:`P${i}`,buys:1,chips:c}))});
test('balanced game and direct transfers',()=>{const r=calculate(game([15000,5000]));assert.deepEqual(r.rows.map(p=>p.net),[1000,-1000]);assert.deepEqual(r.transfers,[{from:'P1',to:'P0',amount:1000}]);});
test('extra chips deduct excess from biggest winner',()=>{const r=calculate(game([16000,5000]));assert.equal(r.difference,200);assert.equal(r.rows[0].payout,3000);});
test('missing chips assign unclaimed pot to winner',()=>{const r=calculate(game([14000,5000]));assert.equal(r.difference,-200);assert.equal(r.rows[0].payout,3000);});
test('all zero chip counts preserve cash total',()=>{const r=calculate(game([0,0,0]));assert.equal(r.rows.reduce((s,p)=>s+p.payout,0),6000);});
test('rounding and random distributions always conserve the pot',()=>{for(let i=1;i<200;i++){const g=game([i*133,31*i,7000]);for(const unit of [1,5,25,100]){const r=calculate(g,unit);assert.equal(r.rows.reduce((s,p)=>s+p.net,0),0);assert.equal(r.rows.reduce((s,p)=>s+p.payout,0),r.total);assert.ok(r.rows.every(p=>p.payout>=0&&p.payout%unit===0));const balances=Object.fromEntries(r.rows.map(p=>[p.name,p.net]));for(const t of r.transfers){balances[t.from]+=t.amount;balances[t.to]-=t.amount;}assert.ok(Object.values(balances).every(v=>v===0));}}});
test('rebuys affect investments',()=>{const g=game([20000,10000]);g.players[0].buys=2;assert.ok(calculate(g).rows.every(p=>p.net===0));});
test('reject indivisible coin unit',()=>{const g=game([10000,10000]);g.cash=1001;assert.throws(()=>calculate(g,100),/rounding unit/);});
