const {test} = require('node:test');
const assert = require('node:assert/strict');
const s = require('../poker-strategy');
const regular = s.profiles.find(p => p.key === 'regular');
function situation(overrides = {}) {
    return {hand:['As','Kd'],board:[],street:'pre_flop',position:.8,inPosition:true,playersBehind:1,
        pot:150,eligiblePot:150,bet:50,call:50,target:100,minRaise:200,canRaise:true,
        stack:950,effectiveStack:1000,bb:100,opponents:[{id:'b',bet:100,stack:900,invested:100}],
        actions:[],preflopRaises:0,limpers:0,streetRaises:0,aggressor:false,checkedTo:false,...overrides};
}
function room() {
    const player = (userId,hand,invested,bet,stack,folded=false) => ({userId,hand,invested,currentBet:bet,chips:stack,folded,hasActed:false});
    return {players:{a:player('a',['2s','3c'],100,0,200),b:player('b',['4c','5c'],100,0,0),
        c:player('c',['6c','7c'],300,200,700),d:player('d',['8c','9c'],150,0,0,true)},
        playersOrder:['a','b','c','d'],activePlayersInRound:['a','b','c','d'],communityCards:['Ah','Kh','Qh','Jh','Th'],
        dealerId:'a',smallBlindId:'b',bigBlindId:'c',gameState:'river',gameMode:'cash',blinds:{big:100},
        currentBetAmount:200,lastRaiseAmount:200,pot:650,handNumber:1,currentHand:{id:'hand-1',actions:[]}};
}

test('starting-hand ordering recognizes big aces, pairs, suited connectors and weak offsuit hands',()=>{
    for (const [better,worse] of [
        [['As','Ad'],['Ks','Kd']],[['As','Ks'],['As','Kd']],[['As','Kd'],['As','Jd']],
        [['9s','8s'],['9s','8d']],[['5s','5d'],['7s','2d']]
    ]) assert.ok(s.preflopStrength(better)>s.preflopStrength(worse));
});

test('public opponent observations learn tendencies once per hand and stay room-local',()=>{
    const game=room(),unknown=s.opponentRead(game,'b');
    for(let i=0;i<30;i++){
        game.currentHand.id='observed-'+i;s.beginHand(game);
        for(let repeat=0;repeat<3;repeat++)s.observe(game,{playerId:'b',street:'pre_flop',action:'call',call:100});
        s.observe(game,{playerId:'b',street:'flop',action:'call',call:100});
        s.observe(game,{playerId:'c',street:'pre_flop',action:'fold',call:100});
        s.observe(game,{playerId:'c',street:'river',action:'raise',call:0});
    }
    const caller=s.opponentRead(game,'b'),tight=s.opponentRead(game,'c');
    assert.ok(caller.vpip>unknown.vpip);assert.ok(caller.vpip<=1);
    assert.ok(caller.foldToBet<unknown.foldToBet);assert.ok(caller.aggression<unknown.aggression);
    assert.ok(tight.vpip<unknown.vpip);assert.ok(tight.foldToBet>unknown.foldToBet);
    assert.deepEqual(s.opponentRead(room(),'b'),unknown);
});

test('contexts whitelist public history and never read hidden hole cards, profiles or the live deck',()=>{
    const game=room(),before=s.context(game,game.players.a),estimate=s.equity(before,32);
    game.currentHand.actions.push({playerId:'c',street:'turn',action:'raise',amount:200,call:0,pot:400,board:['Ah','Kh','Qh','Jh'],context:{hand:['As','Ad']}});
    const publicContext=s.context(game,game.players.a);
    game.currentHand.actions[0].context={hand:['2c','2d']};
    game.currentHand.seats=new Proxy([],{get(){throw Error('private seats accessed');}});
    for(const id of ['b','c','d']){
        game.players[id].hand=new Proxy(['As','Ad'],{get(target,key){if(key==='length')return 2;throw Error('private opponent cards accessed');}});
        Object.defineProperty(game.players[id],'personality',{get(){throw Error('private profile accessed');}});
    }
    Object.defineProperty(game,'deck',{get(){throw Error('future deck accessed');}});
    assert.deepEqual(s.context(game,game.players.a),publicContext);
    assert.doesNotMatch(JSON.stringify(publicContext),/context|personality|private seats/);
    game.currentHand.actions=[];assert.deepEqual(s.context(game,game.players.a),before);
    assert.equal(s.equity(s.context(game,game.players.a),32),estimate);
});

test('side-pot equity weighs each eligible pot against its own contenders',()=>{
    const game=room(),c=s.context(game,game.players.a);
    assert.equal(c.call,200);assert.equal(c.eligiblePot,650);
    assert.deepEqual(c.pots,[{amount:400,opponents:[0,1]},{amount:150,opponents:[1]},{amount:300,opponents:[1]}]);
    assert.ok(Math.abs(s.equity(c,20)-(400/3+450/2)/850)<1e-12);
    game.players.a.chips=50;
    const short=s.context(game,game.players.a);
    assert.equal(short.call,50);assert.equal(short.eligiblePot,500,'exclude deep opponents\' money beyond the short stack\'s covered pot');
    assert.equal(short.pots.reduce((n,p)=>n+p.amount,0),550);
});

test('short-stack openings shove a playable range and fold trash without risking unmatched stacks',()=>{
    assert.deepEqual(s.policy(situation({hand:['As','5s']}),.57,regular,()=>0),{action:'raise',amount:1000});
    assert.equal(s.policy(situation({hand:['7s','2d']}),.35,regular,()=>0).action,'fold');
    const deep=situation({stack:9950,effectiveStack:1000});
    assert.equal(s.policy(deep,.65,regular,()=>0).amount,1000);
});

test('position widens openings and a cheap big-blind defense differs from a costly deep shove',()=>{
    const hand=['9s','8s'];
    assert.equal(s.policy(situation({hand,position:0,inPosition:false,stack:9950,effectiveStack:10000}),.45,regular,()=>0).action,'fold');
    assert.equal(s.policy(situation({hand,position:1,stack:9950,effectiveStack:10000}),.45,regular,()=>0).action,'raise');
    const defend=situation({hand:['Ks','Ts'],position:0,inPosition:false,bet:100,stack:9900,effectiveStack:10000,target:250,call:150,pot:350,eligiblePot:350,preflopRaises:1});
    assert.equal(s.policy(defend,.5,regular,()=>.99).action,'call');
    assert.equal(s.policy({...defend,call:9900,pot:10100,eligiblePot:10100,target:10000,canRaise:false},.35,regular,()=>.99).action,'fold');
});

test('combination draws can semi-bluff while multiway air and an all-in opponent cannot be bluffed',()=>{
    const draw=situation({hand:['Jh','Th'],board:['Qh','9h','2c'],street:'flop',target:0,bet:0,call:0,pot:1000,stack:5000,effectiveStack:5000});
    assert.equal(s.handFeatures(draw.hand,draw.board).strongDraw,true);
    assert.equal(s.policy(draw,.48,regular,()=>0).action,'raise');
    const air={...draw,hand:['7s','3d'],board:['Kh','9h','8c'],aggressor:true,checkedTo:true};
    assert.equal(s.policy({...air,opponents:[...air.opponents,{id:'c',stack:5000}]},.18,regular,()=>0).action,'check');
    assert.equal(s.policy({...air,opponents:[{id:'b',stack:0}]},.18,regular,()=>0).action,'check');
});

test('a river nut-flush blocker can bluff selectively, but unblocked air keeps checking',()=>{
    const c=situation({hand:['As','Qd'],board:['Ks','Js','7c','4s','2h'],street:'river',target:0,bet:0,call:0,pot:2000,stack:6000,effectiveStack:6000});
    assert.equal(s.policy(c,.15,regular,()=>0).action,'raise');
    assert.equal(s.policy({...c,hand:['Ah','Qd']},.15,regular,()=>0).action,'check');
});

test('river overbets from a passive range require more strength than the same line from an aggressive range',()=>{
    const board=['Ad','Js','6h','4c','2d'];
    const c=situation({hand:['Ah','Qc'],board,street:'river',position:0,inPosition:false,bet:0,stack:5500,effectiveStack:5500,
        call:4500,pot:7500,eligiblePot:7500,target:4500,minRaise:9000,
        opponents:[{id:'b',bet:4500,stack:5500,read:{vpip:.2,pfr:.1,aggression:.15}}],
        actions:[{playerId:'b',street:'river',action:'raise',amount:4500,bet:0,pot:3000,call:0,board}]});
    const passive=s.equity(c,768);
    const aggressive={...c,opponents:[{...c.opponents[0],read:{vpip:.5,pfr:.3,aggression:.8}}]};
    const active=s.equity(aggressive,768);
    assert.ok(active>passive+.06);
    assert.equal(s.policy(c,passive,regular,()=>.99).action,'fold');
    assert.equal(s.policy(aggressive,active,regular,()=>.99).action,'call');
});

test('wet-board value bets grow while thin river value uses a smaller size; closed raising stays closed',()=>{
    const dry=situation({hand:['8s','8d'],board:['Kh','8h','2c'],street:'flop',target:0,bet:0,call:0,pot:1000,stack:8000,effectiveStack:8000});
    const wet={...dry,board:['Th','9h','8c']};
    assert.ok(s.policy(wet,.9,regular,()=>0).amount>s.policy(dry,.9,regular,()=>0).amount);
    const thin={...dry,hand:['Kh','Qc'],board:['Kd','8s','3h','2c','9d'],street:'river'};
    assert.ok(s.policy(thin,.75,regular,()=>0).amount<s.policy(dry,.9,regular,()=>0).amount);
    const locked={...wet,canRaise:false,call:500,target:500};
    assert.equal(s.policy(locked,.9,regular,()=>0).action,'call');
});
