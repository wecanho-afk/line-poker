const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-tests-'));
const { TexasHoldemGame, Card, Deck, io, server } = require('../app');
const strategy=require('../poker-strategy'), practice=require('../practice'), history=require('../hand-history');
// No wall-clock turns in engine tests; transitions still use the production code.
TexasHoldemGame.prototype.startTurnTimer=function(){};
const timers=[];
const originalTimeout=global.setTimeout;
global.setTimeout=(fn,ms,...args)=>{const timer=originalTimeout(fn,ms,...args);timers.push(timer);return timer;};
function game(){const g=new TexasHoldemGame('test','hero','Hero');g.addBot();g.startGame();return g;}
test('personality distribution and persistent individual differences',()=>{
 const rng=strategy.seeded('profiles');const samples=Array.from({length:2000},()=>strategy.personality(undefined,rng));
 for(const p of strategy.profiles){const n=samples.filter(x=>x.key===p.key).length;assert.ok(Math.abs(n/20-p.weight)<4);}
 assert.ok(new Set(samples.filter(p=>p.key==='regular').map(p=>p.aggression)).size>50);
});
test('private cards and future deck never change the decision context or estimate',()=>{
 const g=game(),hero=g.players.hero;const c=strategy.context(g,hero),a=strategy.analyze(c);
 g.players[g.playersOrder[1]].hand=[new Card('A','h'),new Card('A','d')];g.deck.cards.reverse();
 assert.deepEqual(strategy.context(g,hero),c);assert.deepEqual(strategy.analyze(strategy.context(g,hero)),a);
});
test('invalid actions cannot mutate chips, pot, turn or history',()=>{
 const g=game(),p=g.getCurrentPlayer();const before=JSON.stringify(g);
 for(const n of [NaN,Infinity,-1,0,1.5,100000]){assert.equal(g.playerAction(p.userId,'raise',n)[0],false);assert.equal(JSON.stringify(g),before);}
 assert.equal(g.playerAction(p.userId,'check')[0],false);assert.equal(JSON.stringify(g),before);
});
test('all 24 practice setups have unique cards, conserved pots and legal bot actions',()=>{
 assert.equal(practice.scenarios.length,24);
 assert.equal(new Set(practice.scenarios.map(s=>s.id)).size,24);
 for(const scene of practice.scenarios){
  const g=new TexasHoldemGame('p','hero','Hero',10000);practice.setup(g,scene,Card,Deck);
  const cards=[...g.communityCards,...Object.values(g.players).flatMap(p=>p.hand),...g.deck.cards].map(String);
  assert.equal(cards.length,52);assert.equal(new Set(cards).size,52);
  assert.equal(g.pot,Object.values(g.players).reduce((n,p)=>n+p.invested,0));
  assert.equal(g.getCurrentPlayer().userId,'hero');
  assert.equal(g.dealerId,scene.dealer==='villain'?g.playersOrder[1]:'hero');
  assert.equal(g.players[g.playersOrder[1]].allIn,scene.villainStack===0);
  const hero=g.players.hero, d=strategy.analyze(strategy.context(g,hero));
  assert.equal(g.playerAction('hero',d.action,d.amount)[0],true);
  if(['pre_flop','flop','turn','river'].includes(g.gameState)){
   const p=g.getCurrentPlayer();
   if(p.canBet()) {
    const decision=strategy.decide(g,p,strategy.seeded(scene.id));
    assert.equal(g.playerAction(p.userId,decision.action,decision.amount)[0],true,scene.id);
   } else {
    assert.ok(g.activePlayersInRound.every(id=>g.players[id].allIn));
    while(['pre_flop','flop','turn','river'].includes(g.gameState))g.endBettingRound();
    assert.equal(g.gameState,'showdown');
    assert.equal(Object.values(g.players).reduce((n,p)=>n+p.chips,0),scene.stack+scene.villainStack+scene.invested*2+scene.heroBet+scene.villainBet);
   }
  }
 }
});
test('all-in drill disallows reraising and limp drill ends after a BB check',()=>{
 const g=new TexasHoldemGame('allin','hero','Hero',10000);
 practice.setup(g,practice.scenarios.find(s=>s.id==='call-short-shove'),Card,Deck);
 assert.equal(strategy.context(g,g.players.hero).canRaise,false);
 assert.equal(g.playerAction('hero','raise',1200)[0],false);
 const limp=new TexasHoldemGame('limp','hero','Hero',10000);
 practice.setup(limp,practice.scenarios.find(s=>s.id==='limp-isolation'),Card,Deck);
 assert.equal(limp.playerAction('hero','check')[0],true);
 assert.equal(limp.gameState,'flop');
});
test('short all-in does not reopen raising, but a full raise does',()=>{
 const g=new TexasHoldemGame('test','hero','Hero');g.addPlayer('b','B');g.addPlayer('c','C');g.startGame();
 g.gameState='flop';g.currentBetAmount=100;g.lastRaiseAmount=100;g.currentPlayerIdx=1;
 Object.values(g.players).forEach(p=>{p.currentBet=100;p.hasActed=true;p.actedAtBet=100;});
 g.players.b.hasActed=false;g.players.b.chips=50;
 assert.equal(g.playerAction('b','raise',150)[0],true);
 assert.equal(g.playerAction('c','raise',250)[0],false);
 assert.equal(g.playerAction('c','call')[0],true);
 assert.equal(g.playerAction('hero','raise',250)[0],false);
});
test('completed hand persists only own hole cards and own decision advice',()=>{
 const g=game(),p=g.getCurrentPlayer();const rival=g.players[g.playersOrder[1]];
 const hidden=rival.hand.map(String);g.playerAction(p.userId,'fold');
 const records=history.read('hero:');assert.ok(records.length);
 const h=records[0];assert.ok(h.actions.length);assert.equal(h.hand.length,2);
 assert.equal(h.actions.some(e=>e.context),false);
 assert.deepEqual(g.toJSON('hero').players.find(p=>p.user_id===rival.userId).hand,['??','??']);
 history.finish(g);assert.equal(history.read('hero:').filter(x=>x.id===h.id).length,1);
});
test('river board royal flush returns split equity, not false private strength',()=>{
 const c={hand:['2s','3s'],board:['Ah','Kh','Qh','Jh','Th'],street:'river',opponents:[{bet:0,invested:20}],bb:20};
 assert.equal(strategy.equity(c,20),.5);
});
test('full simulated hands terminate and conserve chips',()=>{
 for(let run=0;run<12;run++){
  const g=game();g.players.hero.isBot=true;const total=Object.values(g.players).reduce((n,p)=>n+p.chips,0)+g.pot;
  let actions=0;
  while(['pre_flop','flop','turn','river'].includes(g.gameState)&&actions++<150){
   if(g.activePlayersInRound.filter(id=>!g.players[id].allIn).length<=1 && !g.getCurrentPlayer()?.canBet()){g.endBettingRound();continue;}
   const p=g.getCurrentPlayer();if(p.allIn){g.endBettingRound();continue;}
   const d=strategy.decide(g,p);assert.equal(g.playerAction(p.userId,d.action,d.amount)[0],true);
  }
  assert.ok(actions<150);assert.equal(Object.values(g.players).reduce((n,p)=>n+p.chips,0),total);
 }
});
after(()=>{timers.forEach(clearTimeout);global.setTimeout=originalTimeout;io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
