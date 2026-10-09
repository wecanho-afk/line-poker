const {test,after}=require('node:test');
const assert=require('node:assert/strict');
process.env.NO_SERVER='1';
const {TexasHoldemGame,Card,Deck,io,server}=require('../app');
const games=[];
const cards=text=>text.split(' ').map(c=>new Card(c[0],c[1]));
function headsUp(){const g=new TexasHoldemGame('feature-'+games.length,'a','A',1000);games.push(g);g.addPlayer('b','B');return g;}

test('players enter with two time cards; every fiftieth dealt hand awards another and it extends only the current turn once',()=>{
 const g=headsUp();assert.equal(g.players.a.timeCards,2);assert.equal(g.players.b.timeCards,2);g.players.a.handsPlayed=49;assert.equal(g.startGame()[0],true);assert.equal(g.players.a.timeCards,3);
 const player=g.getCurrentPlayer();
 if(player.userId==='a')assert.equal(player.timeCards,3);else assert.equal(player.timeCards,2);
 const before=g.turnDeadline,sequence=g.turnSequence,cardsBefore=player.timeCards;
 assert.equal(g.useTimeCard(player.userId)[0],true);
 assert.equal(g.turnDeadline,before+30000);assert.equal(player.timeCards,cardsBefore-1);assert.equal(player.timeCardTurnId,sequence+1);
 assert.equal(g.latestVoice,'time');const actionCount=g.actionCount;
 assert.equal(g.useTimeCard(player.userId)[0],false);assert.equal(g.actionCount,actionCount);assert.equal(g.latestVoice,'time');
 g.cancelScheduledAction();
});

test('trailing player proposes run once or twice and leader makes the final decision',()=>{
 const g=headsUp();g.startGame();g.cancelScheduledAction();
 g.players.a.hand=cards('As Ad');g.players.b.hand=cards('Ks Kd');
 const used=new Set([...g.players.a.hand,...g.players.b.hand].map(String));g.deck=new Deck();g.deck.cards=g.deck.cards.filter(c=>!used.has(c.toString()));
 const contenders=[g.players.a,g.players.b],before=[...g.estimateRunoutEquities(contenders).values()];g.deck.cards.reverse();assert.deepEqual([...g.estimateRunoutEquities(contenders).values()],before);
 for(const p of Object.values(g.players)){p.chips=0;p.invested=100;p.currentBet=100;p.allIn=true;p.folded=false;p.hasActed=true;}
 g.pot=200;g.currentBetAmount=100;g.gameState='pre_flop';g.activePlayersInRound=['a','b'];
 g.endBettingRound();
 assert.deepEqual({stage:g.runoutDecision.stage,proposer:g.runoutDecision.proposerId,decider:g.runoutDecision.deciderId},{stage:'proposal',proposer:'b',decider:'a'});
 assert.equal(g.chooseRunout('a',2)[0],false);
 assert.equal(g.chooseRunout('b',2)[0],true);assert.equal(g.runoutDecision.stage,'decision');
 assert.equal(g.chooseRunout('a',2)[0],true);assert.equal(g.runoutCount,2);assert.equal(g.scheduledAction.kind,'runout');
 for(let i=0;i<3;i++){g.scheduledAction.due=0;g.advanceDueAction();}
 assert.equal(g.gameState,'showdown');assert.deepEqual(g.runoutBoards.map(b=>b.length),[5,5]);
 assert.equal(new Set(g.runoutBoards.flat().map(String)).size,10);
 assert.equal(Object.values(g.players).reduce((n,p)=>n+p.chips,0),200);
 g.cancelScheduledAction();
});

test('running twice splits each pot between boards and gives the first board the odd chip',()=>{
 const g=headsUp();g.addPlayer('c','C');
 Object.assign(g.players.a,{hand:cards('As Ad'),chips:0,invested:5,allIn:true});
 Object.assign(g.players.b,{hand:cards('Ks Kd'),chips:0,invested:5,allIn:true});
 Object.assign(g.players.c,{hand:cards('Qs Qd'),chips:0,invested:1,allIn:true,folded:true});
 g.activePlayersInRound=['a','b','c'];g.pot=11;g.gameState='river';g.dealerId='a';g.dealerPos=0;
 g.runoutBoards=[cards('2c 3d 7h 8s Tc'),cards('Kh 2d 3h 4s 9c')];g.communityCards=[...g.runoutBoards[0]];
 g.determineWinner();
 assert.deepEqual([g.players.a.chips,g.players.b.chips,g.players.c.chips],[6,5,0]);
 g.cancelScheduledAction();
});

after(()=>{games.forEach(g=>g.cancelScheduledAction());io.close();server.close();});
