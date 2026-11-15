import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createApp, validateGroup, hash } from './app.js';

test('group input rejects duplicate names, invalid amounts, and oversized lists', () => {
  for (const patch of [{players:['Alex',' alex ']},{cash:0},{cash:1.5},{chips:1e10},{players:[]},{players:Array(51).fill('A')},{name:' '},{players:['<script>','<script>']}]) {
    assert.throws(()=>validateGroup({name:'Friday',cash:2000,chips:10000,players:['A','B'],...patch}));
  }
  assert.deepEqual(validateGroup({name:' Friday ',cash:2000,chips:10000,players:[' A ','B']}),{name:'Friday',cash:2000,chips:10000,players:['A','B']});
});

test('real database: Google challenges, sessions, groups, and account isolation', {skip:!process.env.TEST_DATABASE_URL}, async t => {
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:3});
  const prefix='test-'+randomUUID();
  const origin='https://rsr0001.github.io';
  let nonceA,nonceB;
  const app=createApp({pool,clientId:'test-client',origin,verifyGoogle:async credential=>{
    if(credential==='invalid')throw Error('invalid');
    return {sub:prefix+credential,name:credential,nonce:credential==='alice'?nonceA:nonceB};
  }});
  await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(path,{token,body,method='GET',requestOrigin=origin}={}) {
    const response=await fetch(base+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:response.status===204?{}:await response.json(),headers:response.headers};
  }
  try {
    await t.test('CORS rejects unrelated origins and unauthenticated data requests',async()=>{
      assert.equal((await request('/groups')).status,401);
      assert.equal((await request('/config',{requestOrigin:'https://evil.example'})).status,403);
      assert.equal((await request('/config')).headers.get('access-control-allow-origin'),origin);
    });
    nonceA=(await request('/auth/challenge',{method:'POST',body:{}})).data.nonce;
    nonceB=(await request('/auth/challenge',{method:'POST',body:{}})).data.nonce;
    let alice,bob;
    await t.test('invalid signatures and incorrect nonces fail',async()=>{
      assert.equal((await request('/auth/google',{method:'POST',body:{credential:'invalid',nonce:nonceA}})).status,401);
      assert.equal((await request('/auth/google',{method:'POST',body:{credential:'alice',nonce:nonceB}})).status,401);
    });
    await t.test('valid login creates opaque sessions; challenges cannot be replayed',async()=>{
      alice=(await request('/auth/google',{method:'POST',body:{credential:'alice',nonce:nonceA}})).data.token;
      bob=(await request('/auth/google',{method:'POST',body:{credential:'bob',nonce:nonceB}})).data.token;
      assert.match(alice,/^[\w-]{43}$/);
      assert.equal((await request('/auth/google',{method:'POST',body:{credential:'alice',nonce:nonceA}})).status,401);
      assert.equal((await request('/me',{token:alice})).data.user.name,'alice');
    });
    const body={name:'Friday table',cash:2000,chips:10000,players:['Alex','Sam']};
    let group;
    await t.test('save and retrieve a group; different account cannot see, edit, or delete it',async()=>{
      const saved=await request('/groups',{method:'POST',body,token:alice});
      assert.equal(saved.status,201);group=saved.data.group;
      assert.equal((await request('/groups',{token:alice})).data.groups[0].name,body.name);
      assert.deepEqual((await request('/groups',{token:bob})).data.groups,[]);
      assert.equal((await request('/groups/'+group.id,{method:'PUT',body,token:bob})).status,404);
      assert.equal((await request('/groups/'+group.id,{method:'DELETE',token:bob})).status,404);
    });
    await t.test('owner can edit/delete and malformed input fails',async()=>{
      assert.equal((await request('/groups/'+group.id,{method:'PUT',body:{...body,players:['Alex','Sam','Jo']},token:alice})).data.group.players.length,3);
      assert.equal((await request('/groups/'+group.id,{method:'PUT',body:{...body,players:['Alex','alex']},token:alice})).status,400);
      assert.equal((await request('/groups/'+group.id,{method:'DELETE',token:alice})).status,204);
    });
    await t.test('history recomputes payouts, upserts recounts, paginates, and isolates accounts',async()=>{
      const id=randomUUID(),now=new Date().toISOString();
      const game={title:'Friday table',cash:2000,chips:10000,unit:1,created:now,completedAt:now,players:[{name:'Alex',buys:1,chips:15000},{name:'Sam',buys:1,chips:5000}],result:{total:1}};
      assert.equal((await request('/history/'+id,{method:'PUT',body:game,token:alice})).status,200);
      const saved=(await request('/history/'+id,{token:alice})).data.game;
      assert.equal(saved.result.total,4000);assert.equal(saved.result.rows[0].payout,3000);
      assert.deepEqual(saved.result.transfers,[{from:'Sam',to:'Alex',amount:1000}]);
      assert.equal((await request('/history/'+id,{token:bob})).status,404);
      assert.deepEqual((await request('/history',{token:bob})).data.games,[]);
      assert.equal((await request('/history/'+id,{method:'PUT',body:{...game,players:[{name:'Alex',buys:1,chips:10000},{name:'Sam',buys:1,chips:10000}]},token:alice})).status,200);
      assert.equal((await request('/history',{token:alice})).data.games.length,1);
      assert.equal((await request('/history/'+id,{token:alice})).data.game.result.rows[0].payout,2000);
      assert.equal((await request('/history/'+id,{method:'PUT',body:{...game,players:[]},token:alice})).status,400);
      assert.equal((await request('/history?offset=bad',{token:alice})).status,400);
      const owner=(await request('/me',{token:alice})).data.user.id;
      for(let i=0;i<21;i++)await pool.query('INSERT INTO game_history(user_id,game_id,title,completed_at,total,player_count,snapshot,result) VALUES($1,$2,$3,now(),4000,2,$4,$5)',[owner,randomUUID(),'test page',JSON.stringify(game),JSON.stringify(saved.result)]);
      const page=(await request('/history',{token:alice})).data;
      assert.equal(page.games.length,20);assert.equal(page.hasMore,true);
      assert.equal((await request('/history?offset=20',{token:alice})).data.games.length,2);
    });
    await t.test('logout invalidates server session and expired sessions fail',async()=>{
      assert.equal((await request('/auth/logout',{method:'POST',body:{},token:alice})).status,204);
      assert.equal((await request('/me',{token:alice})).status,401);
      await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hash(bob)]);
      assert.equal((await request('/me',{token:bob})).status,401);
    });
  } finally {
    await pool.query('DELETE FROM users WHERE google_sub LIKE $1',[prefix+'%']);
    if(nonceA&&nonceB)await pool.query('DELETE FROM login_challenges WHERE nonce_hash=ANY($1::text[])',[[hash(nonceA),hash(nonceB)]]);
    await new Promise(resolve=>server.close(resolve));
    await pool.end();
  }
});
