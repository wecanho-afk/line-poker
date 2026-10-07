const {test,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');process.env.NO_SERVER='1';process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-bet-label-'));
const {TexasHoldemGame,io,server}=require('../app');const games=[];
test('preflop raise remains Raise; first postflop wager is Bet and next increase is Raise',()=>{
 const g=new TexasHoldemGame('bet-label','a','A');games.push(g);g.addPlayer('b','B');g.startGame();
 const pre=g.getCurrentPlayer();assert.equal(g.playerAction(pre.userId,'raise',40)[0],true);assert.equal(pre.lastAction,'raise');assert.equal(g.currentHand.actions.at(-1).display_action,'raise');
 assert.equal(g.playerAction(g.getCurrentPlayer().userId,'call')[0],true);assert.equal(g.gameState,'flop');assert.equal(g.currentBetAmount,0);
 const first=g.getCurrentPlayer();assert.equal(g.playerAction(first.userId,'raise',20)[0],true);assert.equal(first.lastAction,'bet');assert.equal(g.latestVoice,'bet');assert.equal(g.currentHand.actions.at(-1).action,'raise');assert.equal(g.currentHand.actions.at(-1).display_action,'bet');
 const next=g.getCurrentPlayer();assert.equal(g.playerAction(next.userId,'raise',40)[0],true);assert.equal(next.lastAction,'raise');assert.equal(g.latestVoice,'raise');assert.equal(g.currentHand.actions.at(-1).display_action,'raise');
 assert.equal(g.playerAction(g.getCurrentPlayer().userId,'call')[0],true);assert.equal(g.gameState,'turn');assert.equal(g.currentBetAmount,0);
 assert.equal(g.playerAction(g.getCurrentPlayer().userId,'check')[0],true);const bettor=g.getCurrentPlayer();assert.equal(g.playerAction(bettor.userId,'raise',20)[0],true);assert.equal(bettor.lastAction,'bet');
});
after(()=>{games.forEach(g=>{g.cancelScheduledAction();clearTimeout(g.emptyTimeout);});io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
