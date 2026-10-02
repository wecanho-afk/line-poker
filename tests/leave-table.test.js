const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-leave-'));
const {TexasHoldemGame,GAMES,server,io,Card}=require('../app');
const games=[];let base;
function make(){const g=new TexasHoldemGame('leave-'+games.length,'a','A');g.addPlayer('b','B');GAMES[g.gameId]=g;games.push(g);return g;}
async function post(g,route='/leave_game',data={},key=''){
 const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-History-Key':key},body:JSON.stringify({game_id:g.gameId,user_id:'a',...data})});
 return {status:r.status,...await r.json()};
}
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
test('leave is authenticated, idempotent and hands host controls to a remaining human',async()=>{
 const g=make();g.players.a.historyKey='seat-secret';
 assert.equal((await post(g)).status,403);assert.equal(g.players.a.sittingOut,false);
 assert.equal((await post(g,'/leave_game',{},'seat-secret')).success,true);
 assert.equal(g.players.a.leftTable,true);assert.equal(g.players.a.sittingOut,true);
 assert.equal(g.toJSON('b').host_user_id,'b');
 const messages=g.messages.length;
 assert.equal((await post(g,'/leave_game',{},'seat-secret')).success,true);
 assert.equal(g.messages.length,messages);
 assert.equal((await post(g,'/add_bot',{user_id:'b'})).success,true);
});
test('leaving during a turn folds immediately and preserves pot accounting',async()=>{
 const g=make();g.startGame();const original=g.players.a.chips+g.players.b.chips+g.pot;
 assert.equal((await post(g)).success,true);
 assert.equal(g.players.a.folded,true);assert.equal(g.gameState,'showdown');
 assert.equal(g.players.a.chips+g.players.b.chips,original);
 assert.equal(g.turnDeadline,0);
});
test('all-in leaver still receives a winning pot and skips following hands',async()=>{
 const g=make();g.startGame();g.cancelScheduledAction();
 g.players.a.allIn=true;g.players.a.chips=0;g.players.a.invested=100;
 g.players.b.chips=900;g.players.b.invested=100;g.pot=200;
 g.players.a.hand=[new Card('A','s'),new Card('A','d')];
 g.players.b.hand=[new Card('K','s'),new Card('K','d')];
 g.communityCards=['2c','3d','7h','8s','Tc'].map(c=>new Card(c[0],c[1]));
 assert.equal((await post(g)).success,true);assert.equal(g.players.a.folded,false);
 g.determineWinner();assert.equal(g.players.a.chips,200);
 g.prepareNext();g.startNewRound();assert.equal(g.gameState,'game_over');
 assert.equal(g.players.a.sittingOut,true);
});
test('a waiting seat cannot be automatically seated after leaving; explicit join works',async()=>{
 const g=make();g.players.a.sittingOut=true;g.players.a.waitingForNextRound=true;
 await post(g);assert.equal(g.players.a.waitingForNextRound,false);
 assert.equal((await post(g,'/join_game',{user_name:'A'})).success,true);
 assert.equal(g.players.a.leftTable,false);assert.equal(g.players.a.sittingOut,false);
});
test('socket reconnect cannot reactivate a deliberately vacated seat',async()=>{
 const {io:connect}=require('socket.io-client');const g=make();await post(g);
 const client=connect(base,{transports:['websocket'],reconnection:false});
 try{
  await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);});
  const response=new Promise(resolve=>client.once('table_left',resolve));
  client.emit('join_room',{game_id:g.gameId,user_id:'a'});
  assert.equal((await response).game_id,g.gameId);assert.equal(g.players.a.sittingOut,true);
 }finally{client.disconnect();}
});
after(()=>{games.forEach(g=>{g.cancelScheduledAction();clearTimeout(g.emptyTimeout);});io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
