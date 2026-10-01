const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NO_SERVER = '1';
const { TexasHoldemGame, Card, io, server } = require('../app');
const { Hand } = require('pokersolver');
const cards = text => text.split(' ').map(c => new Card(c[0], c[1]));
const evaluate = text => TexasHoldemGame.prototype.evaluateHand(cards(text));
const games = [];
function game(investments, hands, board = '2c 3d 7h 8s Tc') {
    const g = new TexasHoldemGame('rules-' + games.length, 'a', 'a');
    games.push(g);
    for (let i = 1; i < investments.length; i++) g.addPlayer(String.fromCharCode(97 + i), 'p' + i);
    g.playersOrder.forEach((id, i) => Object.assign(g.players[id], {
        chips: 0, invested: investments[i], hand: cards(hands[i]), allIn: true
    }));
    g.activePlayersInRound = [...g.playersOrder];
    g.communityCards = cards(board);
    g.pot = investments.reduce((a, b) => a + b, 0);
    g.dealerId = 'a'; g.dealerPos = 0; g.gameState = 'river';
    return g;
}
function settle(g, expected) {
    const total = g.pot + Object.values(g.players).reduce((n, p) => n + p.chips, 0);
    g.determineWinner();
    assert.deepEqual(g.playersOrder.map(id => g.players[id].chips), expected);
    assert.equal(Object.values(g.players).reduce((n, p) => n + p.chips, 0), total);
}

test('all nine hand categories have the correct order', () => {
    const hands = ['As Jd 9h 6s 3c', '2s 2d Ah Ks Qc', '2s 2d 3h 3s Ac',
        '2s 2d 2h As Kc', 'As 2d 3h 4s 5c', 'As Js 9s 6s 3s',
        '2s 2d 2h 3s 3c', '2s 2d 2h 2c As', 'As 2s 3s 4s 5s'];
    hands.slice(1).forEach((h, i) => assert.ok(evaluate(h).score > evaluate(hands[i]).score));
});

const comparisons = [
    ['wheel loses to six high', '2s 3d 4h 5c 6s Ah Kd', 'As 2d 3h 4c 5s Qh Jd', 1],
    ['ace cannot wrap a straight', 'Ks Ad 2h 3c 4s 8h 9d', '2s 3d 4h 5c 6s Qh Jd', -1],
    ['royal flush beats king high straight flush', 'As Ks Qs Js Ts 2h 3d', 'Kh Qh Jh Th 9h 2c 3s', 1],
    ['flush fifth card breaks tie', 'As Js 9s 7s 5s Kd Qc', 'Ah Jh 9h 7h 4h Kc Qd', 1],
    ['flush sixth and seventh cards do not count', 'As Js 9s 7s 5s 3s 2s', 'Ah Jh 9h 7h 5h 4h 2h', 0],
    ['three pairs use two highest plus best kicker', 'As Ad Kh Kc Qs Qd 2c', 'Ah Ac Ks Kd Jh Jc 3c', 1],
    ['two trips use higher trips for full house', 'As Ad Ah Ks Kd Kh 2c', 'Ac Ah Ad Qs Qd Qh 3c', 1],
    ['full house compares trips before pair', 'Ks Kd Kh 2s 2d 4c 5c', 'Qs Qd Qh As Ad 7c 8c', 1],
    ['quads compare kicker', '9s 9h 9d 9c As 2d 3c', '9s 9h 9d 9c Ks Qd Jc', 1],
    ['trips compare second kicker', '8s 8h 8d As Qc 3d 2c', '8s 8h 8d As Jc 6d 5c', 1],
    ['pair compares third kicker', '8s 8h As Kd Qc 3d 2c', '8s 8h As Kd Jc 6d 5c', 1],
    ['two pair compares lower pair before kicker', 'As Ah 4s 4d 2c 3h 5c', 'As Ah 3s 3d Kc Qh Jc', 1],
    ['suits do not break ties', 'As Kd Qh Jc 9s 3c 2d', 'Ah Ks Qd Jh 9c 4c 2s', 0],
    ['board royal flush ignores hole cards', 'Ah Kh Qh Jh Th 2c 3d', 'Ah Kh Qh Jh Th As Ad', 0],
    ['board quads with ace kicker splits', '9s 9h 9d 9c As Kh Qh', '9s 9h 9d 9c As 2h 3h', 0],
];
for (const [name, a, b, result] of comparisons) test(name, () => {
    assert.equal(Math.sign(evaluate(a).score - evaluate(b).score), result);
});

test('20,000 seeded seven-card comparisons agree with independent pokersolver', () => {
    let state = 0x13579bdf;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    const deck = Card.SUITS.flatMap(s => Card.RANKS.map(r => r + s));
    for (let trial = 0; trial < 20000; trial++) {
        const shuffled = [...deck];
        for (let i = 0; i < 9; i++) {
            const j = i + Math.floor(random() * (52 - i));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const a = shuffled.slice(0, 7), b = [...shuffled.slice(0, 5), ...shuffled.slice(7, 9)];
        assert.equal(Math.sign(evaluate(a.join(' ')).score - evaluate(b.join(' ')).score),
            -Math.sign(Hand.solve(a).compare(Hand.solve(b))) || 0, a + ' / ' + b);
    }
});

test('all 2,598,960 five-card hands have standard category and equivalence counts', { skip: !process.env.EXHAUSTIVE_POKER }, () => {
    const deck = Card.SUITS.flatMap(s => Card.RANKS.map(r => new Card(r, s)));
    const counts = Array(9).fill(0), scores = Array.from({length:9}, () => new Set());
    for(let a=0;a<48;a++) for(let b=a+1;b<49;b++) for(let c=b+1;c<50;c++)
    for(let d=c+1;d<51;d++) for(let e=d+1;e<52;e++) {
        const {score} = TexasHoldemGame.prototype.evaluateHand([deck[a],deck[b],deck[c],deck[d],deck[e]]);
        const category = Math.floor(score / 10000000);
        counts[category]++; scores[category].add(score);
    }
    assert.deepEqual(counts, [1302540,1098240,123552,54912,10200,5108,3744,624,40]);
    assert.deepEqual(scores.map(s => s.size), [1277,2860,858,858,10,1277,156,156,10]);
});

test('main and side pots have independent winners including folded contributions', () => {
    const g = game([100,500,500,50], ['As Ad','Ks Kd','Qs Qd','Js Jd']);
    g.players.d.folded = true;
    settle(g, [350,800,0,0]);
});
test('disconnected all-in hand remains eligible for every covered pot', () => {
    const g = game([100,500,500], ['As Ad','Ks Kd','Qs Qd']);
    g.handleDisconnect('a');
    settle(g, [300,800,0]);
});
test('disconnect during all-in runout cannot abandon an already uncontested side pot', () => {
    const g = game([100,100,200,200], ['As Ad','Ks Kd','Qs Qd','Js Jd']);
    g.players.c.folded = true;
    g.players.d.allIn = false; g.players.d.chips = 500;
    g.handleDisconnect('d');
    assert.equal(g.gameState, 'showdown');
    assert.equal(g.players.d.folded, false);
    assert.deepEqual(g.playersOrder.map(id=>g.players[id].chips), [400,0,0,700]);
});
test('odd chip goes to first tied winner clockwise after button', () => {
    const g = game([5,5,5], ['2s 3s','4s 5s','6s 7s'], 'Ah Kh Qh Jh Th');
    g.players.c.folded = true;
    settle(g, [7,8,0]);
});
test('side pot ties distribute their own odd chips', () => {
    const g = game([1,2,2,2], ['2s 3s','4s 5s','6s 7s','8s 9s'], 'Ah Kh Qh Jh Th');
    g.players.d.folded = true;
    settle(g, [1,4,2,0]);
});
test('folded contribution levels do not create extra odd-chip awards', () => {
    const g = game([100,100,1,2,3], ['2s 3s','4s 5s','6s 7s','8s 9s','Ts Js'], 'Ah Kh Qh Jh Th');
    for (const id of ['c','d','e']) g.players[id].folded = true;
    settle(g, [103,103,0,0,0]);
});
test('1,000 seeded 2–8 player settlements agree with independent pot and hand calculation', () => {
    let seed = 20261001;
    const random = n => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed % n; };
    const deck = Card.SUITS.flatMap(s => Card.RANKS.map(r => r+s));
    for (let trial=0;trial<1000;trial++) {
        const count=2+random(7), investments=Array.from({length:count},()=>1+random(30));
        const shuffled=[...deck];
        for(let i=shuffled.length-1;i>0;i--) { const j=random(i+1); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]; }
        const board=shuffled.slice(0,5), hands=investments.map((_,i)=>shuffled.slice(5+i*2,7+i*2));
        const g=game(investments,hands.map(h=>h.join(' ')),board.join(' '));
        g.dealerPos=random(count); g.dealerId=g.playersOrder[g.dealerPos];
        const max=Math.max(...investments);
        const live=investments.map((v,i)=>v===max || i===0 || random(3)!==0);
        g.playersOrder.forEach((id,i)=>{ g.players[id].folded=!live[i]; g.players[id].sittingOut=live[i]&&random(3)===0; });
        const solved=hands.map(h=>Hand.solve([...board,...h]));
        const expected=Array(count).fill(0), pots=new Map();
        // Enumerate individual chip levels, then group by eligible competitors.
        for(let chip=1;chip<=max;chip++) {
            const contributors=investments.map((n,i)=>n>=chip?i:-1).filter(i=>i>=0);
            if(contributors.length===1) { expected[contributors[0]]++; continue; }
            const eligible=contributors.filter(i=>live[i]), key=eligible.join(',');
            pots.set(key,(pots.get(key)||0)+contributors.length);
        }
        for(const [key,amount] of pots) {
            const eligible=key.split(',').map(Number);
            const winningHands=Hand.winners(eligible.map(i=>solved[i]));
            const winners=eligible.filter(i=>winningHands.includes(solved[i]));
            winners.sort((a,b)=>(a-g.dealerPos-1+count)%count-(b-g.dealerPos-1+count)%count);
            winners.forEach((id,i)=>expected[id]+=Math.floor(amount/winners.length)+(i<amount%winners.length?1:0));
        }
        settle(g,expected);
        g.cancelScheduledAction();
    }
});
test('fold-only winner receives the contested pot and uncalled chips exactly once', () => {
    const g = game([250,100], ['As Ad','Ks Kd']);
    g.players.b.folded = true;
    g.endRoundSingleWinner();
    assert.equal(g.players.a.chips,350); assert.equal(g.pot,200);
    g.endRoundSingleWinner(); assert.equal(g.players.a.chips,350);
});
test('uncalled excess is a return, not a winning hand', () => {
    const g = game([100,200], ['As Ad','Ks Kd']);
    settle(g, [200,100]);
    assert.deepEqual(g.winners, ['a']);
});
test('settlement cannot pay a completed pot twice', () => {
    const g = game([100,100], ['As Ad','Ks Kd']);
    settle(g, [200,0]); g.determineWinner(); g.endRoundSingleWinner();
    assert.deepEqual(g.playersOrder.map(id => g.players[id].chips), [200,0]);
});
test('new hand clears investments of both sitting-out and busted players', () => {
    const g = game([100,100,100,100], ['As Ad','Ks Kd','Qs Qd','Js Jd']);
    g.gameState = 'waiting_for_next_round';
    g.players.a.chips = g.players.b.chips = 1000;
    g.players.c.chips = 500; g.players.c.sittingOut = true;
    g.startNewRound();
    assert.equal(g.players.c.invested, 0); assert.equal(g.players.d.invested, 0);
    assert.equal(Object.values(g.players).reduce((n,p) => n + p.invested, 0), g.pot);
});
after(() => { games.forEach(g => { g.cancelScheduledAction(); clearTimeout(g.emptyTimeout); }); io.close(); server.close(); });
