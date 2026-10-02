const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.NO_SERVER = '1';
process.env.POKER_HISTORY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-timing-'));
const {TexasHoldemGame, GAMES, server, io} = require('../app');
const {create} = require('../public/turn-clock');
const games = [];
let base;
function game(mode = 'cash') {
    const g = new TexasHoldemGame('timing-' + games.length, 'hero', 'Hero', 1000, mode);
    games.push(g); GAMES[g.gameId] = g; g.addPlayer('other','Other');
    return g;
}
async function post(g, route, data = {}) {
    const response = await fetch(base + route, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({game_id:g.gameId,user_id:'hero',...data})});
    return {status:response.status, ...await response.json()};
}
before(async () => { await new Promise(r => server.listen(0,'127.0.0.1',r)); base = `http://127.0.0.1:${server.address().port}`; });

test('cash rebuy accepts chosen amount and top-ups between hands', async () => {
    const g=game(); g.players.hero.chips=0; g.gameState='game_over';
    assert.equal((await post(g,'/rebuy',{amount:2750})).success,true);
    assert.equal(g.players.hero.chips,2750);
    assert.equal((await post(g,'/rebuy',{amount:'125'})).success,true);
    assert.equal(g.players.hero.chips,2875);
    assert.equal((await post(g,'/start_game')).success,true);
    assert.equal(g.gameState,'pre_flop');
    g.cancelScheduledAction();
});
test('invalid rebuys cannot subtract, truncate, invent or overflow chips', async () => {
    const g=game();
    for(const amount of [-1,0,1.5,'100chips','',null,true,{},[],Number.MAX_SAFE_INTEGER]) {
        const before=g.players.hero.chips;
        const result=await post(g,'/rebuy',{amount});
        assert.equal(result.status,400,JSON.stringify(amount));
        assert.equal(g.players.hero.chips,before);
    }
    assert.equal((await post(g,'/rebuy')).status,400);
});
test('cash and tournament cannot rebuy while a hand is active, including all-in', async () => {
    for(const mode of ['cash','tournament']) {
        const g=game(mode); g.startGame(); g.players.hero.chips=0; g.players.hero.allIn=true;
        for(const street of ['pre_flop','flop','turn','river']) {
            g.gameState=street;
            assert.equal((await post(g,'/rebuy',{amount:2000})).status,409);
            assert.equal(g.players.hero.chips,0);
        }
        g.cancelScheduledAction();
    }
});
test('tournament re-entry retains its fixed starting stack and count limit', async () => {
    const g=game('tournament');g.gameState='waiting_for_next_round';g.players.hero.chips=0;
    assert.equal((await post(g,'/rebuy',{amount:99999})).success,true);
    assert.equal(g.players.hero.chips,1000);
    assert.equal(g.tournamentManager.playersStats.hero.reEntriesUsed,1);
    g.players.hero.chips=0;g.tournamentManager.playersStats.hero.reEntriesUsed=2;
    assert.equal((await post(g,'/rebuy',{amount:99999})).success,false);
    assert.equal(g.players.hero.chips,0);
});
test('cash rebuy after showdown does not alter the settled pot', async () => {
    const g=game();g.gameState='showdown';g.handSettled=true;g.pot=123;
    assert.equal((await post(g,'/rebuy',{amount:456})).success,true);
    assert.equal(g.players.hero.chips,1456); assert.equal(g.pot,123);
});

test('no automatic action before 20 seconds, then exactly one timeout fold', t => {
    t.mock.timers.enable({apis:['setTimeout','Date'],now:1000000});
    const g=game();g.startGame();const p=g.getCurrentPlayer();
    assert.equal(g.turnDeadline,g.scheduledAction.due);
    assert.equal(g.toJSON(p.userId).turn_remaining_ms,20000);
    t.mock.timers.tick(19999);
    g.advanceDueAction();
    assert.equal(p.folded,false);assert.equal(g.actionCount,0);
    assert.equal(g.toJSON(p.userId).turn_remaining_ms,1);
    t.mock.timers.tick(1);
    assert.equal(p.folded,true);assert.equal(g.gameState,'showdown');
    const count=g.actionCount;g.advanceDueAction();assert.equal(g.actionCount,count);
    g.cancelScheduledAction();
});
test('timeout checks instead of folding when no call is owed', t => {
    t.mock.timers.enable({apis:['setTimeout','Date'],now:2000000});
    const g=game();g.startGame();
    assert.equal(g.playerAction(g.getCurrentPlayer().userId,'call')[0],true);
    const p=g.getCurrentPlayer();
    t.mock.timers.tick(19999);assert.equal(p.folded,false);
    t.mock.timers.tick(1);
    assert.equal(p.folded,false);assert.equal(g.gameState,'flop');
    g.cancelScheduledAction();
});
test('previous player timer cannot fire during the next player thinking time', t => {
    t.mock.timers.enable({apis:['setTimeout','Date'],now:3000000});
    const g=game();g.startGame();const firstId=g.toJSON('hero').turn_id;
    t.mock.timers.tick(19000);
    g.playerAction(g.getCurrentPlayer().userId,'call');
    assert.notEqual(g.toJSON('hero').turn_id,firstId);
    const next=g.getCurrentPlayer(), count=g.actionCount;
    t.mock.timers.tick(1000);
    assert.equal(g.actionCount,count);assert.equal(next.folded,false);
    assert.equal(g.toJSON('hero').turn_remaining_ms,19000);
    g.cancelScheduledAction();
});
test('polling and socket disconnect do not shorten or restart the deadline', async () => {
    const {io:connect}=require('socket.io-client');
    const g=game();g.startGame(); const deadline=g.turnDeadline, count=g.actionCount;
    const client=connect(base,{transports:['websocket'],reconnection:false});
    try {
        await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);});
        client.emit('join_room',{game_id:g.gameId,user_id:'hero'});
        await new Promise(resolve=>client.once('game_update',resolve));
        client.disconnect();
        const r=await fetch(`${base}/get_game_state/${g.gameId}/hero`);const s=await r.json();
        assert.equal(s.game_state.turn_deadline,deadline);assert.equal(g.actionCount,count);
        assert.equal(g.players.hero.folded,false);
    } finally {client.disconnect();g.cancelScheduledAction();}
});
test('outdated action request cannot fold a later turn', async () => {
    const g=game();g.startGame();
    const count=g.actionCount;
    g.playerAction('hero','call');g.playerAction('other','check');g.playerAction('other','check');
    assert.equal(g.getCurrentPlayer().userId,'hero');
    const r=await post(g,'/game_action',{action:'fold',expected_action_count:count});
    assert.equal(r.status,409);assert.equal(g.players.hero.folded,false);
    g.cancelScheduledAction();
});

function snapshot(remaining=20000,id=1) {return {game_id:'x',hand_number:1,turn_id:id,server_time:2000000,turn_deadline:2000000+remaining,turn_remaining_ms:remaining};}
test('phone wall-clock skew does not affect displayed thinking time', t => {
    let monotonic=500;const clock=create(()=>monotonic);
    for(const phoneTime of [0,9999999999999]) {
        t.mock.method(Date,'now',()=>phoneTime);
        const s=snapshot();clock.capture(s);clock.accept(s);
        assert.equal(clock.remaining(),20000);
    }
    monotonic+=5000;assert.equal(clock.remaining(),15000);
});
test('delayed responses and repeated snapshots cannot add thinking time', () => {
    let now=100;const clock=create(()=>now),s=snapshot();
    clock.capture(s,0);clock.accept(s);assert.equal(clock.remaining(),19900);
    now=5100;clock.capture(s);clock.accept(s);assert.equal(clock.remaining(),14900);
    now=21000;assert.equal(clock.remaining(),0);
    const next=snapshot(20000,2);clock.capture(next);clock.accept(next);assert.equal(clock.remaining(),20000);
    clock.accept({...next,turn_deadline:0,turn_id:null});assert.equal(clock.remaining(),0);
});
after(()=>{games.forEach(g=>g.cancelScheduledAction());io.close();server.close();fs.rmSync(process.env.POKER_HISTORY_DIR,{recursive:true,force:true});});
