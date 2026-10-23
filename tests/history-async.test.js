const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createHash} = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-async-history-'));
process.env.POKER_HISTORY_DIR = directory;
const history = require('../hand-history'), strategy = require('../poker-strategy');
let sequence = 0;
function context() {
    return {hand:['As','Kd'],board:['2h','5s','8d'],boards:[['2h','5s','8d']],street:'flop',
        position:.5,positionLabel:'SB',inPosition:false,playersBehind:0,pot:100,eligiblePot:100,
        bet:0,call:20,target:20,minRaise:40,canRaise:true,stack:1000,effectiveStack:1000,bb:20,
        opponents:[{id:'rival',bet:20,stack:980,invested:20}],actions:[],preflopRaises:0,
        limpers:0,streetRaises:1,aggressor:false,checkedTo:false};
}
function fixture(owner, count=1) {
    const number = ++sequence;
    return {gameId:'async-room',handNumber:number,communityCards:['2h','5s','8d'],runoutBoards:null,
        pot:100,winners:['hero'],players:{hero:{chips:1100,historyKey:owner,name:'Hero'},rival:{chips:900,name:'Rival'}},
        currentHand:{id:'async-hand-'+number,number,started:new Date(number*1000).toISOString(),
            gameId:'async-room',blinds:{small:10,big:20},seats:[
                {id:'hero',hand:['As','Kd'],chips:1000,bot:false},
                {id:'rival',hand:['Qc','Qd'],chips:1000,bot:true}],
            actions:Array.from({length:count},()=>({playerId:'hero',name:'Hero',street:'flop',
                board:['2h','5s','8d'],pot:100,stack:1000,call:20,bet:0,position:'SB',
                action:'call',amount:20,context:context()})),finished:false}};
}
function archive(owner) {
    return path.join(directory,createHash('sha256').update('hero:'+owner).digest('hex')+'.json');
}

test('settlement publishes a private review without main-thread analysis or synchronous archive I/O',async()=>{
    const game=fixture('nonblocking',24), analyze=strategy.analyze;
    const syncRead=fs.readFileSync,syncWrite=fs.writeFileSync;
    let analyses=0,reads=0,writes=0,updates=0;
    strategy.analyze=()=>{analyses++;throw Error('analysis ran on the game thread');};
    fs.readFileSync=()=>{reads++;throw Error('synchronous read on the game thread');};
    fs.writeFileSync=()=>{writes++;throw Error('synchronous write on the game thread');};
    try { history.finish(game,()=>updates++); }
    finally {strategy.analyze=analyze;fs.readFileSync=syncRead;fs.writeFileSync=syncWrite;}
    assert.equal(analyses,0);assert.equal(reads,0);assert.equal(writes,0);
    const raw=game.completedReviews.hero;
    assert.equal(raw.analysis_status,'pending');assert.ok(raw.actions.every(action=>action.advice===null));
    assert.doesNotMatch(JSON.stringify(raw),/context|Qc|Qd/);
    let eventLoopContinued=false;
    await new Promise(resolve=>setImmediate(()=>{eventLoopContinued=true;resolve();}));
    assert.equal(eventLoopContinued,true);
    assert.equal(game.completedReviews.hero.analysis_status,'pending','the game event loop runs while expensive advice is still computing');
    await history.flush();
    const ready=game.completedReviews.hero;
    assert.equal(ready.analysis_status,'ready');assert.ok(ready.actions.every(action=>action.advice?.action));
    assert.equal(updates,1);assert.equal(raw.analysis_status,'pending','publish a new revision without mutating prior snapshots');
    assert.doesNotMatch(fs.readFileSync(archive('nonblocking'),'utf8'),/context|Qc|Qd/);
});

test('queued revisions preserve both hands, capture their owner and never replace a newer completed hand',async()=>{
    const game=fixture('desktop',8),first=game.currentHand.id;
    let updates=0;
    history.finish(game,()=>updates++);
    history.finish(game,()=>updates++);
    const next=fixture('desktop',1);
    game.currentHand=next.currentHand;game.handNumber=next.handNumber;
    history.finish(game,()=>updates++);
    const latest=game.currentHand.id;
    game.players.hero.historyKey='mobile';
    await history.flush();
    assert.equal(game.completedReviews.hero.id,latest);
    assert.equal(game.completedReviews.hero.analysis_status,'ready');assert.equal(updates,1);
    const saved=JSON.parse(fs.readFileSync(archive('desktop'),'utf8'));
    assert.deepEqual(new Set(saved.map(hand=>hand.id)),new Set([first,latest]));
    assert.ok(saved.every(hand=>hand.analysis_status==='ready'));
    assert.equal(history.read('hero:desktop').filter(hand=>hand.id===first).length,1);
    assert.equal(fs.existsSync(archive('mobile')),false);
});

test('a failed analysis preserves the original hand and the worker can analyze the next job',async()=>{
    const broken=fixture('broken-analysis');
    broken.currentHand.actions[0].context.hand=['As','As'];
    history.finish(broken);
    const original=broken.completedReviews.hero;
    await history.flush();
    assert.equal(original.analysis_status,'pending');
    assert.equal(broken.completedReviews.hero.analysis_status,'failed');
    assert.equal(broken.completedReviews.hero.actions[0].advice,null);
    const archived=JSON.parse(fs.readFileSync(archive('broken-analysis'),'utf8'));
    assert.equal(archived[0].id,original.id);assert.equal(archived[0].analysis_status,'failed');
    assert.deepEqual(archived[0].hand,['As','Kd']);assert.doesNotMatch(JSON.stringify(archived),/context/);
    const next=fixture('after-failure');history.finish(next);await history.flush();
    assert.equal(next.completedReviews.hero.analysis_status,'ready');
});

test('archive errors retain the owner review and use the directory captured at settlement',async()=>{
    const blocked=path.join(directory,'blocked');fs.writeFileSync(blocked,'not a directory');
    const game=fixture('archive-failure');
    process.env.POKER_HISTORY_DIR=blocked;
    try {history.finish(game);}
    finally {process.env.POKER_HISTORY_DIR=directory;}
    assert.equal(game.completedReviews.hero.analysis_status,'pending');
    await history.flush();
    assert.equal(game.historyError,true);assert.equal(game.completedReviews.hero.analysis_status,'ready');
    assert.ok(history.read('hero:archive-failure').some(hand=>hand.id===game.currentHand.id));
    assert.equal(fs.existsSync(archive('archive-failure')),false);
});

after(async()=>{await history.flush();fs.rmSync(directory,{recursive:true,force:true});});
