const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-reveal-'));
const {TexasHoldemGame,GAMES,server,io}=require('../app');
const games=[];let base;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
function make(finish=true){const g=new TexasHoldemGame('reveal-'+games.length,'a','A');games.push(g);GAMES[g.gameId]=g;g.addPlayer('b','B');g.players.a.historyKey='key-a';g.players.b.historyKey='key-b';g.startGame();g.cancelScheduledAction();if(finish){g.playerAction(g.getCurrentPlayer().userId,'fold');g.cancelScheduledAction();}return g;}
async function show(g,indexes,extra={},key='key-a') {const r=await fetch(base+'/show_cards',{method:'POST',headers:{'Content-Type':'application/json','X-History-Key':key},body:JSON.stringify({game_id:g.gameId,user_id:'a',hand_number:g.handNumber,card_indexes:indexes,...extra})});return {status:r.status,...await r.json()};}
function hand(g,viewer='b',id='a'){return g.toJSON(viewer).players.find(p=>p.user_id===id).hand;}
test('one card, either position, is selectively public to opponents and spectators; both can be added',async()=>{
 for(const index of [0,1]){const g=make();assert.deepEqual(hand(g),['??','??']);const before=g.players.a.chips+g.players.b.chips;assert.equal((await show(g,[index])).success,true);assert.equal(hand(g)[index],g.players.a.hand[index].toString());assert.equal(hand(g)[1-index],'??');assert.deepEqual(hand(g,'spectator'),hand(g));assert.equal((await show(g,[0,1])).success,true);assert.deepEqual(hand(g),g.players.a.hand.map(String));assert.equal((await show(g,[index])).success,true);assert.equal(g.players.a.shownCardIndexes.length,2);assert.equal(g.players.a.chips+g.players.b.chips,before);}
});
test('early, stale, forged and malformed requests cannot reveal cards',async()=>{
 const active=make(false);assert.equal((await show(active,[0])).success,false);assert.deepEqual(hand(active),['??','??']);
 const g=make();for(const value of [[],[2],[-1],['0'],[0,0],[0,1,0],null])assert.equal((await show(g,value)).success,false);
 assert.equal((await show(g,[0],{hand_number:g.handNumber-1})).success,false);
 assert.equal((await show(g,[0],{user_id:'b'})).status,403);
 assert.equal((await show(g,[0],{},'wrong')).status,403);
 assert.equal((await show(g,[0],{user_id:'missing'})).success,false);
 assert.deepEqual(hand(g),['??','??']);
});
test('folded players may show after completion; visibility survives prepareNext but resets next hand',async()=>{
 const g=make();const id=g.playersOrder.find(id=>g.players[id].folded);assert.equal((await show(g,[1],{user_id:id},'key-'+id)).success,true);g.prepareNext();assert.equal(hand(g,'spectator',id)[1],g.players[id].hand[1].toString());const old=g.handNumber;g.startNewRound();g.cancelScheduledAction();assert.deepEqual(g.players[id].shownCardIndexes,[]);assert.deepEqual(hand(g,'spectator',id),['??','??']);assert.equal((await show(g,[0],{hand_number:old})).success,false);
});
test('normal contested showdown still exposes eligible hands and no folded cards',()=>{
 const g=make(false);g.gameState='showdown';assert.deepEqual(hand(g),g.players.a.hand.map(String));g.players.a.folded=true;assert.deepEqual(hand(g),['??','??']);
});
after(()=>{games.forEach(g=>{g.cancelScheduledAction();clearTimeout(g.emptyTimeout);});io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
