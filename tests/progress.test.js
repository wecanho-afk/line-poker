const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
process.env.NO_SERVER='1';process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-progress-'));
const {TexasHoldemGame,Card,Deck,server,io,GAMES}=require('../app');
const practice=require('../practice'),bot=require('../bot_gto');
const games=[];
function make(id='cbet') {
 const g=new TexasHoldemGame('p'+games.length,'hero','Hero',10000);
 games.push(g);GAMES[g.gameId]=g;practice.setup(g,practice.scenarios.find(s=>s.id===id),Card,Deck);return g;
}
test('HTTP synchronization executes a suspended bot turn exactly once',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const g=make();g.players.hero.historyKey='test-secret';
 const decide=bot.decide;bot.decide=()=>({action:'check',amount:0});
 try {
  assert.equal(g.playerAction('hero','check')[0],true);
  assert.equal(g.scheduledAction.kind,'turn');clearTimeout(g.turnTimeout);g.scheduledAction.due=Date.now()-1;
  const url=`http://127.0.0.1:${server.address().port}/get_game_state/${g.gameId}/hero`;
  const denied=await fetch(url);assert.equal(denied.status,403);assert.equal(g.actionCount,1);
  const response=await fetch(url,{headers:{'X-History-Key':'test-secret'}});const res=await response.json();
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(res.game_state.action_count,2);
  assert.equal(res.game_state.current_player_id,'hero');
  g.advanceDueAction();assert.equal(g.actionCount,2);
 }finally{bot.decide=decide;}
});
test('all-in runout and settlement recover without background callbacks',()=>{
 const g=make('call-short-shove');assert.equal(g.playerAction('hero','call')[0],true);
 for(let i=0;i<3;i++){
  assert.equal(g.scheduledAction.kind,'runout');assert.equal(g.toJSON('hero').current_player_id,null);
  clearTimeout(g.turnTimeout);g.scheduledAction.due=0;g.advanceDueAction();
 }
 assert.equal(g.gameState,'showdown');assert.equal(g.communityCards.length,5);
 assert.equal(g.scheduledAction.kind,'next');clearTimeout(g.turnTimeout);g.scheduledAction.due=0;g.advanceDueAction();
 assert.ok(['waiting_for_next_round','game_over'].includes(g.gameState));
 const total=Object.values(g.players).reduce((n,p)=>n+p.chips,0);
 g.advanceDueAction();assert.equal(Object.values(g.players).reduce((n,p)=>n+p.chips,0),total);
});
test('bot strategy exceptions cannot strand a turn',()=>{
 const g=make();g.playerAction('hero','check');const decide=bot.decide;bot.decide=()=>{throw Error('test strategy failure');};
 try{g.scheduledAction.due=0;g.advanceDueAction();assert.equal(g.actionCount,2);assert.equal(g.getCurrentPlayer().userId,'hero');}
 finally{bot.decide=decide;}
});
after(()=>{games.forEach(g=>g.cancelScheduledAction());io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
