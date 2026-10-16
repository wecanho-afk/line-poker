const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-stickers-'));
const {TexasHoldemGame,GAMES,server,io}=require('../app');
const {io:connect}=require('socket.io-client');
let base,game,sender,viewer;
const once=(socket,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`timeout: ${event}`)),1200);socket.once(event,data=>{clearTimeout(timer);resolve(data);});});
const emitAck=(socket,id)=>new Promise((resolve,reject)=>socket.timeout(1200).emit('table_sticker',{id},(error,result)=>error?reject(error):resolve(result)));

before(async()=>{
 game=new TexasHoldemGame('sticker-room','hero','Hero');game.players.hero.historyKey='hero-key';game.addPlayer('viewer','Viewer');game.players.viewer.historyKey='viewer-key';GAMES[game.gameId]=game;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 sender=connect(base,{transports:['websocket'],reconnection:false});viewer=connect(base,{transports:['websocket'],reconnection:false});
 await Promise.all([once(sender,'connect'),once(viewer,'connect')]);
 sender.emit('join_room',{game_id:game.gameId,user_id:'hero',history_key:'hero-key'});viewer.emit('join_room',{game_id:game.gameId,user_id:'viewer',history_key:'viewer-key'});
 await Promise.all([once(sender,'game_update'),once(viewer,'game_update')]);
});

test('fixed room stickers are broadcast with the authenticated seat identity',async()=>{
 const received=once(viewer,'table_sticker');
 assert.equal((await emitAck(sender,'nice')).success,true);
 const event=await received;assert.equal(event.id,'nice');assert.equal(event.user_id,'hero');assert.equal(typeof event.at,'number');
});

test('unknown stickers and rapid spam are rejected',async()=>{
 assert.equal((await emitAck(sender,'<img src=x>')).success,false);
 assert.equal((await emitAck(sender,'wow')).success,false);
 await new Promise(resolve=>setTimeout(resolve,1550));
 assert.equal((await emitAck(sender,'wow')).success,true);
});

after(()=>{sender?.disconnect();viewer?.disconnect();game?.cancelScheduledAction();io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
