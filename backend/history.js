import * as shared from '../settlement.js';
// The existing browser/CommonJS module also attaches to globalThis when loaded as ESM.
const settlement=shared.default || globalThis.Poker;

export function completedGame(body) {
  const invalid = () => { throw Object.assign(new Error('Use a completed game with valid players, chip counts, and buy-in settings.'), {status:400}); };
  if (!body || typeof body !== 'object') invalid();
  const {cash,chips,unit,players}=body;
  if (!Number.isSafeInteger(cash)||cash<1||cash>1e7||!Number.isSafeInteger(chips)||chips<1||chips>1e9||
      ![1,5,25,100].includes(unit)||!Array.isArray(players)||players.length<1||players.length>50) invalid();
  if (players.some(p=>!p||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>40||
      !Number.isSafeInteger(p.buys)||p.buys<1||p.buys>9999||!Number.isSafeInteger(p.chips)||p.chips<0||p.chips>1e12)) invalid();
  if (new Set(players.map(p=>p.name.trim().toLowerCase())).size!==players.length) invalid();
  const created=Date.parse(body.created),completed=Date.parse(body.completedAt);
  if (!Number.isFinite(created)||!Number.isFinite(completed)||created>completed||completed>Date.now()+300000||created<Date.UTC(2020,0,1)) invalid();
  const title=typeof body.title==='string'?body.title.trim():'';
  if (!title||title.length>80) invalid();
  const game={cash,chips,unit,created:new Date(created).toISOString(),completedAt:new Date(completed).toISOString(),title,
    players:players.map(p=>({name:p.name.trim(),buys:p.buys,chips:p.chips}))};
  const raw=game.players.reduce((sum,p)=>sum+p.chips*cash/chips,0);
  if (!Number.isFinite(raw)||raw>Number.MAX_SAFE_INTEGER/100) invalid();
  let result;
  try {result=settlement.calculate(game,unit);} catch {invalid();}
  return {game,result};
}
