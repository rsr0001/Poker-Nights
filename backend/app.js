import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { completedGame } from './history.js';

export const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateGroup(body) {
  const { name, cash, chips, players } = body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 ||
      !Number.isSafeInteger(cash) || cash < 1 || cash > 10000000 ||
      !Number.isSafeInteger(chips) || chips < 1 || chips > 1e9 ||
      !Array.isArray(players) || players.length < 1 || players.length > 50 ||
      players.some(p => typeof p !== 'string' || !p.trim() || p.trim().length > 40) ||
      new Set(players.map(p => p.trim().toLowerCase())).size !== players.length) {
    throw Object.assign(new Error('Use a group name, 1–50 different player names, and valid buy-in settings.'), { status: 400 });
  }
  return { name: name.trim(), cash, chips, players: players.map(p => p.trim()) };
}

export function createApp({ pool, clientId, origin, verifyGoogle }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Vary', 'Origin');
    if (req.headers.origin) {
      if (req.headers.origin !== origin) return res.status(403).json({ error: 'Origin not allowed.' });
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.headers.origin !== origin) {
      return res.status(403).json({ error: 'Origin required.' });
    }
    next();
  });
  app.use(rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'poker-nights-api' });
  });
  app.get('/config', (req, res) => res.json({ googleClientId: clientId || null }));
  const authLimit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/auth/challenge', authLimit, async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is being configured. Guest mode is available.' });
    const nonce = randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO login_challenges VALUES ($1, now() + interval '10 minutes')", [hash(nonce)]);
    res.json({ nonce });
  });
  app.post('/auth/google', authLimit, async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is being configured.' });
    if (typeof req.body?.credential !== 'string' || req.body.credential.length > 12000 ||
        typeof req.body.nonce !== 'string' || !/^[\w-]{43}$/.test(req.body.nonce)) {
      return res.status(400).json({ error: 'Invalid sign-in request.' });
    }
    let identity;
    try { identity = await verifyGoogle(req.body.credential); }
    catch { return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' }); }
    if (!identity?.sub || identity.nonce !== req.body.nonce) return res.status(401).json({ error: 'Invalid sign-in challenge.' });
    const consumed = await pool.query('DELETE FROM login_challenges WHERE nonce_hash=$1 AND expires_at > now() RETURNING nonce_hash', [hash(req.body.nonce)]);
    if (!consumed.rowCount) return res.status(401).json({ error: 'Sign-in expired or already used. Please try again.' });
    const user = (await pool.query(`INSERT INTO users(id,google_sub,name) VALUES ($1,$2,$3)
      ON CONFLICT(google_sub) DO UPDATE SET name=excluded.name RETURNING id,name`,
      [randomUUID(), identity.sub, String(identity.name || 'Poker player').slice(0,100)])).rows[0];
    const token = randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessions VALUES ($1,$2,now() + interval '12 hours')", [hash(token), user.id]);
    res.json({ token, user });
  });
  app.use(async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in to use saved groups.' });
    const user = (await pool.query(`SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`, [hash(token)])).rows[0];
    if (!user) return res.status(401).json({ error: 'Your session expired. Sign in again.' });
    req.user = user;
    req.tokenHash = hash(token);
    next();
  });
  app.get('/me', (req, res) => res.json({ user: req.user }));
  app.post('/auth/logout', async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.tokenHash]);
    res.sendStatus(204);
  });
  app.get('/groups', async (req, res) => {
    const result = await pool.query('SELECT id,name,cash,chips,players,updated_at FROM groups WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
    res.json({ groups: result.rows });
  });
  app.post('/groups', async (req, res) => {
    const g = validateGroup(req.body);
    // Serialize each user's inserts so concurrent requests cannot bypass the cap.
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const count = (await db.query('SELECT count(*)::int AS n FROM groups WHERE user_id=$1', [req.user.id])).rows[0].n;
      if (count >= 100) throw Object.assign(new Error('You can save up to 100 groups.'), { status: 409 });
      const result = await db.query('INSERT INTO groups(id,user_id,name,cash,chips,players) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,cash,chips,players', [randomUUID(),req.user.id,g.name,g.cash,g.chips,JSON.stringify(g.players)]);
      await db.query('COMMIT');
      res.status(201).json({ group: result.rows[0] });
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  });
  app.put('/groups/:id', async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(404).json({ error: 'Group not found.' });
    const g = validateGroup(req.body);
    const result = await pool.query('UPDATE groups SET name=$1,cash=$2,chips=$3,players=$4,updated_at=now() WHERE id=$5 AND user_id=$6 RETURNING id,name,cash,chips,players', [g.name,g.cash,g.chips,JSON.stringify(g.players),req.params.id,req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group not found.' });
    res.json({ group: result.rows[0] });
  });
  app.delete('/groups/:id', async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(404).json({ error: 'Group not found.' });
    const result = await pool.query('DELETE FROM groups WHERE id=$1 AND user_id=$2', [req.params.id,req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group not found.' });
    res.sendStatus(204);
  });
  app.get('/history', async (req, res) => {
    const offset=Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset)||offset<0||offset>1000000) return res.status(400).json({error:'Invalid page.'});
    const result=await pool.query(`SELECT game_id AS id,title,completed_at,total,player_count FROM game_history
      WHERE user_id=$1 ORDER BY completed_at DESC,game_id DESC LIMIT 21 OFFSET $2`,[req.user.id,offset]);
    res.json({games:result.rows.slice(0,20),hasMore:result.rows.length>20});
  });
  app.get('/history/:id', async (req,res) => {
    if (!uuid.test(req.params.id)) return res.status(404).json({error:'Game not found.'});
    const result=await pool.query('SELECT game_id AS id,snapshot,result,updated_at FROM game_history WHERE user_id=$1 AND game_id=$2',[req.user.id,req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Game not found.'});
    res.json({game:result.rows[0]});
  });
  app.put('/history/:id', async (req,res) => {
    if (!uuid.test(req.params.id)) return res.status(400).json({error:'Invalid game ID.'});
    const {game,result}=completedGame(req.body);
    await pool.query(`INSERT INTO game_history(user_id,game_id,title,completed_at,total,player_count,snapshot,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,game_id) DO UPDATE SET
      title=excluded.title,completed_at=excluded.completed_at,total=excluded.total,player_count=excluded.player_count,
      snapshot=excluded.snapshot,result=excluded.result,updated_at=now()`,
      [req.user.id,req.params.id,game.title,game.completedAt,result.total,game.players.length,JSON.stringify(game),JSON.stringify(result)]);
    res.json({saved:true,id:req.params.id});
  });
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) console.error('API request failed:', error.code || error.name);
    res.status(status).json({ error: status === 500 ? 'Unable to save changes. Please try again.' : error.message });
  });
  return app;
}
