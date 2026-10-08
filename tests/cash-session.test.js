const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-cash-session-'));
const {TexasHoldemGame,GAMES,server,io}=require('../app');
let base;
before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});

async function post(route,body){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};}

test('cash room creation requires and publishes a 1-1000 hand limit',async()=>{
 for(const cash_hand_limit of [0,-1,1.5,1001,null,'many'])assert.equal((await post('/create_game',{user_id:'bad',user_name:'Bad',game_mode:'cash',cash_hand_limit})).status,400);
 const result=await post('/create_game',{user_id:'host',user_name:'Host',initial_chips:1000,game_mode:'cash',cash_hand_limit:3});
 assert.equal(result.success,true);assert.equal(result.game_state.hand_limit,3);delete GAMES[result.game_id];
});

test('fixed-hand cash room stops after the final hand and ranks buy-in, chips and net result',()=>{
 const g=new TexasHoldemGame('fixed','a','Alice',1000,'cash',10,600,2,2);GAMES[g.gameId]=g;g.addPlayer('b','Bob');g.addBot();
 assert.equal(g.players.a.totalBuyIn,1000);assert.equal(g.players.b.totalBuyIn,1000);
 g.handNumber=2;g.gameState='showdown';g.players.a.chips=1450;g.players.b.chips=550;
 const botId=g.playersOrder[2];g.players[botId].chips=0;
 g.prepareNext();
 assert.equal(g.gameState,'game_over');assert.equal(g.players[botId].chips,0,'final settlement must not auto rebuy a busted bot');
 const state=g.toJSON('a');assert.equal(state.hand_limit,2);
 assert.deepEqual(state.cash_settlement.map(p=>[p.name,p.total_buy_in,p.final_chips,p.net,p.status]),[
  ['Alice',1000,1450,450,'水上'],[g.players[botId].name,1000,0,-1000,'水下'],['Bob',1000,550,-450,'水下']
 ].sort((a,b)=>b[3]-a[3]));
 assert.equal(g.startGame()[0],false);g.startNewRound();assert.equal(g.handNumber,2);
 delete GAMES[g.gameId];
});

test('cash top-ups accumulate in total buy-in and are locked after final settlement',async()=>{
 const g=new TexasHoldemGame('buyins','Hero','Hero',1000,'cash',10,600,2,1);GAMES[g.gameId]=g;g.addPlayer('Other','Other');
 let result=await post('/rebuy',{game_id:g.gameId,user_id:'Hero',amount:400});
 assert.equal(result.success,true);assert.equal(g.players.Hero.chips,1400);assert.equal(g.players.Hero.totalBuyIn,1400);
 g.handNumber=1;g.gameState='game_over';
 result=await post('/rebuy',{game_id:g.gameId,user_id:'Hero',amount:100});
 assert.equal(result.status,409);assert.equal(g.players.Hero.totalBuyIn,1400);delete GAMES[g.gameId];
});

after(()=>{io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
