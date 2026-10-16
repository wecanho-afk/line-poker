const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-auto-next-'));
const {TexasHoldemGame,io,server}=require('../app');
const games=[];
function make(limit=50){const g=new TexasHoldemGame('auto-'+games.length,'a','A',1000,'cash',10,600,2,limit);g.addPlayer('b','B');games.push(g);g.startGame();g.cancelScheduledAction();return g;}
test('fold settlement allows showing cards for two seconds then deals exactly one next hand',()=>{
 const g=make(),started=Date.now();g.playerAction(g.getCurrentPlayer().userId,'fold');
 const due=g.scheduledAction.due;assert.equal(g.scheduledAction.kind,'next');assert.ok(due-started>=2000&&due-started<2100);
 assert.equal(g.gameState,'showdown');assert.equal(g.canShowCards(g.players.a),true);
 assert.equal(g.showCards('a',1,[0])[0],true);
 g.advanceDueAction(due-1);assert.equal(g.handNumber,1);
 g.advanceDueAction(due);assert.equal(g.handNumber,2);assert.equal(g.gameState,'pre_flop');assert.equal(g.currentHand.number,2);
 assert.deepEqual(g.players.a.shownCardIndexes,[]);assert.equal(g.showCards('a',1,[1])[0],false);
 g.advanceDueAction(due);assert.equal(g.handNumber,2);
});
test('contested and run-twice showdowns both use a two-second pause',()=>{
 for(const twice of [false,true]){
  const g=make();g.communityCards.push(...g.deck.deal(5));
  if(twice){g.runoutBoards=[[...g.communityCards],g.deck.deal(5)];g.runoutCount=2;g.runoutSharedCount=0;}
  const started=Date.now();g.determineWinner();assert.equal(g.gameState,'showdown');assert.ok(g.scheduledAction.due-started>=2000&&g.scheduledAction.due-started<2100);
  assert.ok(g.toJSON('a').next_hand_remaining_ms>0);g.advanceDueAction(g.scheduledAction.due);assert.equal(g.handNumber,2);
 }
});
test('expired show-card window rejects late requests even if its timer was suspended',()=>{
 const g=make();g.playerAction(g.getCurrentPlayer().userId,'fold');g.scheduledAction.due=Date.now()-1;
 assert.equal(g.showCards('a',1,[0])[0],false);
});
test('the final cash hand settles without dealing an extra hand',()=>{
 const g=make(1);g.playerAction(g.getCurrentPlayer().userId,'fold');g.advanceDueAction(g.scheduledAction.due);
 assert.equal(g.handNumber,1);assert.equal(g.gameState,'game_over');assert.equal(g.scheduledAction,null);assert.equal(g.toJSON('a').cash_settlement.length,2);
});
test('practice waits for replay and insufficient players stop safely',()=>{
 const g=make();g.practice={id:'test'};g.playerAction(g.getCurrentPlayer().userId,'fold');g.advanceDueAction(g.scheduledAction.due);
 assert.equal(g.handNumber,1);assert.equal(g.gameState,'waiting_for_next_round');
 const h=make();h.playerAction(h.getCurrentPlayer().userId,'fold');h.players.b.sittingOut=true;h.advanceDueAction(h.scheduledAction.due);
 assert.equal(h.handNumber,1);assert.equal(h.gameState,'game_over');
});
after(()=>{games.forEach(g=>{g.cancelScheduledAction();clearTimeout(g.emptyTimeout);});io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
