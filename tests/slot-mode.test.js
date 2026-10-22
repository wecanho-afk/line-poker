const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NO_SERVER='1';
process.env.POKER_HISTORY_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'poker-slot-mode-'));
const {TexasHoldemGame,GAMES,server,io}=require('../app');
const games=[];
let base;

before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
async function create(body){const response=await fetch(base+'/create_game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};}
function game(id='slot',players=3,interval=1,chips=1000){
 const g=new TexasHoldemGame(id,'a','A',chips,'cash',10,600,2,50,interval);games.push(g);
 for(let i=1;i<players;i++)g.addPlayer(String.fromCharCode(97+i),String.fromCharCode(65+i));
 return g;
}
function beginSlot(g){
 assert.equal(g.gameState,'slot_announcement');
 assert.equal(g.scheduledAction?.kind,'slot_start');
 const announcement=g.toJSON('a');
 assert.equal(announcement.current_player_id,null);assert.ok(announcement.slot_announcement_remaining_ms>0);
 g.scheduledAction.due=0;g.advanceDueAction();
}
function checkToShowdown(g){
 let guard=0;
 while(['flop','turn','river'].includes(g.gameState)&&guard++<30){
  const actor=g.getCurrentPlayer();
  assert.ok(actor?.canBet(),`missing actor on ${g.gameState}`);
  assert.equal(g.playerAction(actor.userId,'check')[0],true);
 }
 assert.ok(guard<30,'slot hand must terminate');
}

test('cash room creation validates and publishes the slot interval',async()=>{
 for(const slot_interval of [-1,1.5,1001,'many'])assert.equal((await create({user_id:'bad',user_name:'Bad',game_mode:'cash',cash_hand_limit:50,slot_interval})).status,400);
 const disabled=await create({user_id:'off',user_name:'Off',game_mode:'cash',cash_hand_limit:50});
 assert.equal(disabled.success,true);assert.equal(disabled.game_state.slot_interval,0);delete GAMES[disabled.game_id];
 const enabled=await create({user_id:'host',user_name:'Host',game_mode:'cash',cash_hand_limit:50,slot_interval:5});
 assert.equal(enabled.success,true);assert.equal(enabled.game_state.slot_interval,5);delete GAMES[enabled.game_id];
});

test('the configured interval triggers only its scheduled hands',()=>{
 const g=game('frequency',2,3);g.startGame();g.cancelScheduledAction();
 assert.equal(g.handNumber,1);assert.equal(g.isSlotHand,false);assert.equal(g.gameState,'pre_flop');
 g.gameState='waiting_for_next_round';g.startNewRound();g.cancelScheduledAction();
 assert.equal(g.handNumber,2);assert.equal(g.isSlotHand,false);
 const potBefore=g.pot,chipsBefore=Object.values(g.players).map(p=>p.chips);
 g.gameState='waiting_for_next_round';g.startNewRound();
 assert.equal(g.handNumber,2);assert.equal(g.isSlotHand,true);assert.equal(g.gameState,'slot_announcement');assert.equal(g.pot,potBefore);assert.deepEqual(Object.values(g.players).map(p=>p.chips),chipsBefore);
 beginSlot(g);
 assert.equal(g.handNumber,3);assert.equal(g.isSlotHand,true);assert.equal(g.gameState,'flop');assert.equal(g.getCurrentPlayer().userId,g.smallBlindId);
});

test('slot hands collect 4BB, deal two flops and start action from the small blind',()=>{
 const g=game('mechanics',3,1),total=3000;g.startGame();beginSlot(g);
 assert.equal(g.isSlotHand,true);assert.equal(g.gameState,'flop');assert.equal(g.pot,240);
 assert.deepEqual(g.activePlayersInRound.map(id=>g.players[id].invested),[80,80,80]);
 assert.deepEqual(g.activePlayersInRound.map(id=>g.players[id].currentBet),[0,0,0]);
 assert.deepEqual(g.runoutBoards.map(board=>board.length),[3,3]);
 assert.equal(new Set([...g.runoutBoards.flat(),...g.activePlayersInRound.flatMap(id=>g.players[id].hand)].map(String)).size,12);
 assert.equal(g.getCurrentPlayer().userId,g.smallBlindId);
 const state=g.toJSON('a');assert.equal(state.slot_hand,true);assert.equal(state.slot_forced_bet,80);assert.equal(state.runout_shared_count,0);
 checkToShowdown(g);
 assert.equal(g.gameState,'showdown');assert.deepEqual(g.runoutBoards.map(board=>board.length),[5,5]);
 assert.equal(Object.values(g.players).reduce((sum,p)=>sum+p.chips,0),total);
 assert.equal(g.currentHand.variant.key,'slot_double_board');
});

test('a short 4BB contribution creates a safe side pot across both boards',()=>{
 const g=game('short-stack',3,1);g.players.a.chips=50;const total=2050;g.startGame();beginSlot(g);
 assert.equal(g.players.a.invested,50);assert.equal(g.players.a.allIn,true);
 assert.deepEqual([g.players.b.invested,g.players.c.invested],[80,80]);assert.equal(g.pot,210);
 checkToShowdown(g);
 assert.equal(Object.values(g.players).reduce((sum,p)=>sum+p.chips,0),total);
 assert.deepEqual(g.runoutBoards.map(board=>board.length),[5,5]);
});

test('all-in slot hands finish both boards without asking for a runout choice',()=>{
 const g=game('all-in-slot',2,1,50);g.startGame();beginSlot(g);
 assert.equal(g.runoutDecision,null);assert.equal(g.scheduledAction.kind,'runout');assert.deepEqual(g.runoutBoards.map(board=>board.length),[3,3]);
 while(g.scheduledAction?.kind==='runout'){g.scheduledAction.due=0;g.advanceDueAction();}
 assert.equal(g.gameState,'showdown');assert.deepEqual(g.runoutBoards.map(board=>board.length),[5,5]);
 assert.equal(g.players.a.chips+g.players.b.chips,100);
});

test('the lobby explains and submits the optional cash-table mode',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const atmosphere=fs.readFileSync(path.join(__dirname,'../public/poker-atmosphere.js'),'utf8');
 assert.match(html,/id="slotIntervalInput"[^>]*value="0"[^>]*min="0"/);
 assert.match(html,/slot_interval: slotInterval/);assert.match(html,/每人投入 4BB/);
 assert.match(atmosphere,/state\.game_state==='slot_announcement'/);assert.match(atmosphere,/拉霸模式即將開始/);
});

after(()=>{games.forEach(g=>{g.cancelScheduledAction();clearTimeout(g.emptyTimeout);});io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
