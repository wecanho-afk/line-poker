const { Hand } = require('pokersolver');
const ranks = '23456789TJQKA';
const clamp = n => Math.max(0, Math.min(1, n));
const cardText = c => typeof c === 'string' ? c : c.rank + c.suit;
const profiles = [
    { key: 'recreational', label: '休閒跟注型', weight: 30, looseness: .72, aggression: .24, bluff: .035, sizing: .55 },
    { key: 'passive', label: '謹慎被動型', weight: 20, looseness: .30, aggression: .20, bluff: .015, sizing: .45 },
    { key: 'regular', label: '穩健常客型', weight: 25, looseness: .42, aggression: .66, bluff: .12, sizing: .65 },
    { key: 'loose', label: '鬆兇施壓型', weight: 15, looseness: .78, aggression: .82, bluff: .21, sizing: .80 },
    { key: 'rock', label: '緊手價值型', weight: 10, looseness: .12, aggression: .43, bluff: .01, sizing: .75 }
];
function personality(key, random = Math.random) {
    let selected = profiles.find(p => p.key === key);
    if (!selected) { let pick = random() * 100; selected = profiles.find(p => (pick -= p.weight) < 0) || profiles[0]; }
    return { ...selected, looseness: clamp(selected.looseness + (random() - .5) * .18),
        aggression: clamp(selected.aggression + (random() - .5) * .18),
        bluff: clamp(selected.bluff * (.7 + random() * .6)), sizing: selected.sizing * (.85 + random() * .3), handsPlayed: 0 };
}
function seeded(text) {
    let seed = 2166136261;
    for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Room-local observations contain public actions only. Nothing is attached to
// players or serialized to spectators, and old rooms can be garbage-collected.
const memories = new WeakMap();
function memory(game) {
    if (!memories.has(game)) memories.set(game, { players: new Map(), hand: null, entered: new Set(), raised: new Set() });
    return memories.get(game);
}
function beginHand(game) {
    const m = memory(game), key = game.currentHand?.id || game.handNumber;
    if (m.hand === key) return;
    m.hand = key; m.entered.clear(); m.raised.clear();
    for (const id of game.activePlayersInRound) {
        let stats = m.players.get(id);
        if (!stats) {
            stats = { hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, checks: 0, faced: 0, folds: 0 };
            m.players.set(id, stats);
        }
        for (const name of Object.keys(stats)) stats[name] *= .985;
        stats.hands++;
    }
    while (m.players.size > 64) m.players.delete(m.players.keys().next().value);
}
function observe(game, event) {
    const m = memory(game), stats = m.players.get(event.playerId);
    if (!stats) return;
    if (event.street === 'pre_flop') {
        if ((event.action === 'raise' || event.action === 'call' && event.call > 0) && !m.entered.has(event.playerId)) {
            m.entered.add(event.playerId); stats.vpip++;
        }
        if (event.action === 'raise' && !m.raised.has(event.playerId)) { m.raised.add(event.playerId); stats.pfr++; }
    } else {
        if (event.action === 'raise') stats.bets++;
        if (event.action === 'call' && event.call > 0) stats.calls++;
        if (event.action === 'check') stats.checks++;
    }
    if (event.call > 0) { stats.faced++; if (event.action === 'fold') stats.folds++; }
}
function opponentRead(game, id) {
    const s = memories.get(game)?.players.get(id);
    return { samples: Math.round(s?.hands || 0),
        vpip: ((s?.vpip || 0) + 6) / ((s?.hands || 0) + 20),
        pfr: ((s?.pfr || 0) + 3.6) / ((s?.hands || 0) + 20),
        aggression: ((s?.bets || 0) + 3.5) / ((s?.bets || 0) + (s?.calls || 0) + (s?.checks || 0) + 10),
        foldToBet: ((s?.folds || 0) + 4.5) / ((s?.faced || 0) + 10) };
}
function preflopStrength(hand) {
    const [a, b] = hand.map(cardText), hi = Math.max(ranks.indexOf(a[0]), ranks.indexOf(b[0])) + 2;
    const lo = Math.min(ranks.indexOf(a[0]), ranks.indexOf(b[0])) + 2, suited = a[1] === b[1];
    if (hi === lo) return [.51,.54,.58,.63,.68,.73,.78,.82,.86,.90,.94,.97,.99][hi - 2];
    if (hi === 14) return Math.min(.96, ({13:.90,12:.85,11:.80,10:.75,9:.67,8:.64,7:.61,6:.59,5:.62,4:.60,3:.58,2:.56}[lo]) + (suited ? .04 : 0));
    const broadway = { '13:12':.79, '13:11':.74, '13:10':.69, '12:11':.71, '12:10':.66, '11:10':.65 };
    return clamp((broadway[hi + ':' + lo] ?? (.2 + hi * .027 + lo * .01 - Math.max(0, hi - lo - 1) * .025)) + (suited ? .055 : 0));
}
function boardTexture(board) {
    const values = board.map(c => ranks.indexOf(c[0]) + 2), suits = [...'shdc'].map(s => board.filter(c => c[1] === s).length);
    const unique = new Set(values); if (unique.has(14)) unique.add(1);
    let connected = 0;
    for (let low = 1; low <= 10; low++) connected = Math.max(connected, [...unique].filter(n => n >= low && n < low + 5).length);
    return { high: Math.max(0, ...values), paired: new Set(values).size < values.length,
        flushCount: Math.max(0, ...suits), connected,
        wet: clamp((Math.max(0, Math.max(...suits) - 1) + Math.max(0, connected - 2)) / 4),
        scare: values.length > 3 && values.at(-1) > Math.max(...values.slice(0, -1)) };
}
function handFeatures(hand, board) {
    if (board.length < 3) return { value: preflopStrength(hand), draw: 0, strongDraw: false, blocker: false, topPair: false, overpair: false, rank: 0 };
    const all = [...hand, ...board], texture = boardTexture(board), values = all.map(c => ranks.indexOf(c[0]) + 2);
    const pocket = hand[0][0] === hand[1][0], holeValues = hand.map(c => ranks.indexOf(c[0]) + 2);
    const topPair = holeValues.includes(texture.high), overpair = pocket && holeValues[0] > texture.high;
    const solved = Hand.solve(all), rank = solved.rank;
    // A pair/trips already on the board is not a private made hand.
    const boardCounts = board.map(c => board.filter(b => b[0] === c[0]).length);
    const privatePair = hand.some(c => board.some(b => b[0] === c[0])) || pocket;
    let value = [0,.12,.35,.67,.80,.87,.92,.97,.99,1][rank] || .12;
    if (rank === 2) value = privatePair ? overpair ? .64 : topPair ? .57 + (Math.max(...holeValues) >= 12 ? .03 : 0) : .36 : .18;
    if (rank === 3 && texture.paired && !pocket) value = .48;
    if (rank === 4 && Math.max(...boardCounts) === 3 && !privatePair) value = .23;
    const suit = [...'shdc'].find(s => board.filter(c => c[1] === s).length >= 3);
    const blocker = !!suit && hand.includes('A' + suit);
    if (board.length === 5 && Hand.winners([solved, Hand.solve(board)]).length > 1) value = .1;
    let flushDraw = false, straightOuts = 0;
    if (board.length < 5) {
        flushDraw = [...'shdc'].some(s => all.filter(c => c[1] === s).length === 4 && hand.some(c => c[1] === s));
        const known = new Set(values); if (known.has(14)) known.add(1);
        const missing = new Set();
        for (let low = 1; low <= 10; low++) {
            const window = Array.from({length:5}, (_,i) => low + i), absent = window.filter(n => !known.has(n));
            if (absent.length === 1 && holeValues.some(n => window.includes(n) || n === 14 && low === 1)) missing.add(absent[0] === 1 ? 14 : absent[0]);
        }
        straightOuts = missing.size * 4;
    }
    const draw = Math.min(15, (flushDraw ? 9 : 0) + straightOuts) / 15;
    return { value, draw, strongDraw: flushDraw || straightOuts >= 8, blocker, topPair, overpair, rank };
}
function context(game, player) {
    const id = player.userId, order = game.playersOrder.filter(i => game.players[i].hand.length === 2);
    const anchor = game.gameState === 'pre_flop' ? game.bigBlindId : game.dealerId, start = order.indexOf(anchor);
    const actionOrder = order.slice(start + 1).concat(order.slice(0, start + 1));
    const opponents = game.activePlayersInRound.filter(i => i !== id && !game.players[i].folded).map(i => ({
        id: i, bet: game.players[i].currentBet, stack: game.players[i].chips, invested: game.players[i].invested,
        acted: !!game.players[i].hasActed, read: opponentRead(game, i)
    }));
    const call = Math.min(player.chips, Math.max(0, game.currentBetAmount - player.currentBet));
    const cap = player.invested + call;
    const contributions = game.activePlayersInRound.map(i => ({ id:i, amount:Math.min(cap, game.players[i].invested + (i === id ? call : 0)), folded:game.players[i].folded }));
    const levels = [...new Set(contributions.map(p => p.amount).filter(n => n > 0))].sort((a,b) => a-b);
    let previous = 0;
    const pots = levels.map(level => {
        const contributors = contributions.filter(p => p.amount >= level);
        const amount = (level - previous) * contributors.length; previous = level;
        return { amount, opponents: opponents.map((o,i) => contributors.some(p => p.id === o.id && !p.folded) ? i : -1).filter(i => i >= 0) };
    });
    const actions = (game.currentHand?.actions || []).map(e => ({
        playerId:e.playerId, street:e.street, action:e.action, amount:e.amount, call:e.call, bet:e.bet || 0, pot:e.pot, board:e.board?.slice() || []
    }));
    const preflop = actions.filter(e => e.street === 'pre_flop'), street = actions.filter(e => e.street === game.gameState);
    const ownIndex = actionOrder.indexOf(id);
    return { hand: player.hand.map(cardText), board: game.communityCards.map(cardText), street: game.gameState,
        position: actionOrder.length < 2 ? .5 : Math.max(0, ownIndex) / (actionOrder.length - 1),
        positionLabel: id === game.dealerId ? 'BTN' : id === game.smallBlindId ? 'SB' : id === game.bigBlindId ? 'BB' : '其他位置',
        inPosition: opponents.every(o => actionOrder.indexOf(o.id) < ownIndex),
        playersBehind: opponents.filter(o => o.stack > 0 && !o.acted && actionOrder.indexOf(o.id) > ownIndex).length,
        pot: game.pot, eligiblePot: Math.max(0, pots.reduce((n,p) => n + p.amount, 0) - call), pots, bet: player.currentBet, call,
        target: game.currentBetAmount, minRaise: game.currentBetAmount + game.lastRaiseAmount,
        canRaise: opponents.some(p => p.stack > 0) && (!player.hasActed || game.currentBetAmount - (player.actedAtBet || 0) >= game.lastRaiseAmount),
        stack: player.chips, effectiveStack: Math.min(player.chips + player.currentBet, Math.max(0, ...opponents.map(o => o.stack + o.bet))),
        bb: game.blinds.big, opponents, mode: game.gameMode, actions,
        preflopRaises: preflop.filter(e => e.action === 'raise').length,
        limpers: new Set(preflop.filter(e => e.action === 'call' && e.amount <= game.blinds.big).map(e => e.playerId)).size,
        aggressor: preflop.filter(e => e.action === 'raise').at(-1)?.playerId === id,
        streetRaises: street.filter(e => e.action === 'raise').length,
        checkedTo: opponents.every(o => o.acted && o.bet === 0) };
}

function rangeWeight(hand, c, opponent, feature) {
    const score = preflopStrength(hand), read = opponent.read || {vpip:.3,pfr:.18,aggression:.35};
    const actions = (c.actions || []).filter(e => e.playerId === opponent.id);
    const pre = actions.filter(e => e.street === 'pre_flop' && (e.action === 'raise' || e.action === 'call'));
    const raise = pre.filter(e => e.action === 'raise').at(-1);
    let threshold = .16;
    if (pre.length) threshold = raise ? .80 - read.pfr * .65 : .70 - read.vpip * .55;
    else if (c.street === 'pre_flop' && opponent.bet > c.bb) threshold = .63;
    const raiseSize = (raise?.amount || opponent.bet) / Math.max(1, c.bb);
    if (raiseSize >= 9 && (c.preflopRaises || 0) >= 2) threshold += .14;
    // A 10BB shove covers a wider range than a deep-stack 4-bet.
    if (raiseSize >= 7 && opponent.stack === 0 && raiseSize <= 15) threshold -= .08;
    let weight = .015 + .985 / (1 + Math.exp((threshold - score) / .065));
    for (const street of ['flop','turn','river']) {
        const line = actions.filter(e => e.street === street);
        const action = line.filter(e => e.action === 'raise').at(-1) || line.at(-1);
        if (!action || action.action === 'fold' || action.board.length < 3) continue;
        const f = feature(hand, action.board);
        if (action.action === 'check') { weight *= .8 + (1 - f.value) * .2; continue; }
        const pressure = (action.action === 'raise' ? action.amount - action.bet : action.call) / Math.max(c.bb, action.pot);
        const threshold = action.action === 'raise' ? .48 + Math.min(2,pressure) * .18 - read.aggression * .1 : .34 + Math.min(2,pressure) * .05;
        const value = 1 / (1 + Math.exp((threshold - f.value) / .065));
        const draw = street === 'river' ? 0 : f.draw * .55;
        const bluff = action.action === 'raise' ? .008 + read.aggression * (f.blocker ? .20 : .06) : .015;
        weight *= Math.max(.015, Math.min(1, value + draw + bluff));
    }
    return weight;
}
// Sample weighted unknown ranges, remove every used card, then deal a fresh
// unknown board. Actual opponents' cards and the live deck are never consulted.
function equity(c, iterations = c.opponents.length > 2 ? 128 : 192) {
    if (!c.opponents.length) return 1;
    const known = new Set([...c.hand, ...c.board]);
    const deck = [...ranks].flatMap(r => [...'shdc'].map(s => r + s)).filter(x => !known.has(x));
    const random = seeded(JSON.stringify(c)), features = new Map();
    const feature = (hand, board) => {
        const key = hand.join('') + ':' + board.join('');
        if (!features.has(key)) features.set(key, handFeatures(hand, board));
        return features.get(key);
    };
    const combos = [];
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) combos.push([deck[i],deck[j]]);
    const ranges = c.opponents.map(opponent => {
        let total = 0;
        return combos.map(hand => ({ hand, cumulative: total += rangeWeight(hand, c, opponent, feature) }));
    });
    const pick = (range, used) => {
        for (let attempt = 0; attempt < 128; attempt++) {
            const target = random() * range.at(-1).cumulative;
            let low = 0, high = range.length - 1;
            while (low < high) { const mid = (low + high) >>> 1; if (range[mid].cumulative < target) low = mid + 1; else high = mid; }
            const hand = range[low].hand;
            if (!hand.some(card => used.has(card))) return hand;
        }
        const remaining = deck.filter(card => !used.has(card));
        const a = remaining.splice(Math.floor(random() * remaining.length),1)[0];
        return [a, remaining[Math.floor(random() * remaining.length)]];
    };
    let wins = 0;
    const riverHero = c.board.length === 5 ? Hand.solve([...c.hand, ...c.board]) : null;
    for (let i = 0; i < iterations; i++) {
        const used = new Set(), hands = ranges.map(range => { const hand = pick(range, used); hand.forEach(card => used.add(card)); return hand; });
        const available = deck.filter(card => !used.has(card)), board = c.board.slice();
        while (board.length < 5) board.push(available.splice(Math.floor(random() * available.length),1)[0]);
        const hero = riverHero || Hand.solve([...c.hand,...board]), villains = hands.map(hand => Hand.solve([...hand,...board]));
        const pots = c.call > 0 && c.pots?.length ? c.pots : [{amount:1,opponents:villains.map((_,j) => j)}];
        let payout = 0, total = 0;
        for (const pot of pots) {
            const best = Hand.winners([hero, ...pot.opponents.map(j => villains[j])]);
            if (best.includes(hero)) payout += pot.amount / best.length;
            total += pot.amount;
        }
        wins += payout / Math.max(1,total);
    }
    return wins / iterations;
}
function raiseAction(c, p, kind = 'value') {
    const call = { action:c.call ? 'call' : 'check', amount:0 };
    if (!c.canRaise || c.stack + c.bet <= c.target) return call;
    const feature = handFeatures(c.hand,c.board), texture = boardTexture(c.board);
    const reads = c.opponents.filter(o => o.stack > 0).map(o => o.read || {vpip:.3,foldToBet:.45});
    const station = reads.some(r => r.vpip > .42 && r.foldToBet < .4);
    const depth = (c.effectiveStack ?? c.stack + c.bet) / Math.max(1,c.bb);
    let size;
    if (c.street === 'pre_flop') {
        if (depth <= 12 || c.target >= c.bb * 8 && depth <= 28 && kind === 'value') size = c.stack + c.bet;
        else if (c.target <= c.bb) size = c.bb * (2.3 + (c.limpers || 0) + (c.inPosition ? 0 : .5) + (station ? .5 : 0));
        else size = c.target * ((c.preflopRaises || 0) >= 2 ? 2.3 : c.inPosition ? 3 : 3.8);
    } else {
        const fraction = kind === 'thin' ? .38 : kind === 'probe' ? .32 : .52 + texture.wet * .32 + (station ? .12 : 0) + (p.sizing - .65) * .2;
        size = c.call ? c.target + (c.pot + c.call) * Math.max(.6,fraction) : c.pot * fraction;
        const remaining = c.stack + c.bet - size;
        if (kind === 'value' && feature.value >= .8 && remaining < (c.pot + size) * .38) size = c.stack + c.bet;
    }
    const maximum = Math.min(c.stack + c.bet,Math.max(c.minRaise,c.effectiveStack ?? c.stack + c.bet));
    return { action:'raise', amount:Math.min(maximum, Math.max(c.minRaise,Math.round(size))) };
}
function policy(c, eq, p, random = Math.random) {
    const call = {action:c.call ? 'call' : 'check',amount:0}, fold = {action:c.call ? 'fold' : 'check',amount:0};
    const odds = c.call / Math.max(1,(c.eligiblePot ?? c.pot) + c.call), multi = c.opponents.length > 1;
    const read = c.opponents.reduce((a,o) => ({fold:a.fold + (o.read?.foldToBet ?? .45),agg:a.agg + (o.read?.aggression ?? .35)}),{fold:0,agg:0});
    const foldRate = read.fold / Math.max(1,c.opponents.length), aggression = read.agg / Math.max(1,c.opponents.length);
    const depth = (c.effectiveStack ?? c.stack + c.bet) / Math.max(1,c.bb);
    const raise = kind => raiseAction(c,p,kind);
    if (c.street === 'pre_flop') {
        const strength = preflopStrength(c.hand), opening = c.target <= c.bb;
        const threshold = .72 - p.looseness * .16 - c.position * .16 + Math.max(0,c.opponents.length - 1) * .012;
        if (opening) {
            if (!c.call && strength < threshold) return call;
            if (strength < threshold - (depth <= 12 ? .06 : 0)) return fold;
            return strength >= .85 || random() < .35 + p.aggression * .65 ? raise('value') : call;
        }
        const margin = .04 - p.looseness * .04 + (c.playersBehind || 0) * .009;
        if (strength >= ((c.preflopRaises || 0) >= 2 ? .93 : .87) && eq >= Math.max(odds + margin,.53)) return raise('value');
        const suitedWheel = c.hand[0][1] === c.hand[1][1] && c.hand.some(card => card[0] === 'A') && Math.min(...c.hand.map(card => ranks.indexOf(card[0])+2)) <= 5;
        if (!multi && c.target <= c.bb * 4 && depth > 35 && foldRate > .5 && suitedWheel && random() < p.bluff) return raise('bluff');
        const pocket = c.hand[0][0] === c.hand[1][0];
        const setMine = pocket && c.target <= c.bb * 5 && (c.preflopRaises || 0) < 2 && (c.playersBehind || 0) <= 1 && (c.effectiveStack || 0) >= c.call * 18;
        const realization = c.inPosition ? .98 : multi ? .83 : .91;
        return eq * realization >= odds + margin || setMine ? call : fold;
    }
    const f = handFeatures(c.hand,c.board), texture = boardTexture(c.board), river = c.street === 'river';
    const pressure = c.call / Math.max(c.bb,c.pot - c.call);
    const edge = .045 - p.looseness * .04 + (multi ? .035 : 0) + (pressure > .9 && aggression < .32 ? .06 : 0);
    const valueThreshold = multi ? .78 : .69;
    if (c.call) {
        if (eq > valueThreshold && f.value >= .57 && random() < .45 + p.aggression * .55) return raise('value');
        const semiBluff = !river && f.strongDraw && eq > odds + .08 && !multi && c.stack > c.call * 3 && foldRate > .35;
        if (semiBluff && random() < p.aggression * .38) return raise('bluff');
        return eq >= odds + edge ? call : fold;
    }
    if (f.value >= .8 && eq >= (multi ? .64 : .6)) return raise('value');
    if (eq >= (multi ? .66 : .56) && f.value >= .48 && random() < .35 + p.aggression * .6) return raise(river || f.value < .64 ? 'thin' : 'value');
    if (!river && f.strongDraw && !multi && random() < p.aggression * .65) return raise('bluff');
    // Never bluff into an all-in opponent: winning chips there requires a hand.
    const canBluff = !multi && c.opponents.every(o => o.stack > 0) && depth > 12 && foldRate >= .4;
    const credible = river ? f.blocker && f.value < .35 : c.aggressor && texture.wet < .55 || c.inPosition && c.checkedTo && texture.scare;
    if (canBluff && credible && random() < p.bluff * (foldRate > .6 ? 1.7 : 1)) return raise('probe');
    return call;
}
function analyze(c) {
    const eq = equity(c), odds = c.call / Math.max(1,(c.eligiblePot ?? c.pot) + c.call);
    const decision = policy(c,eq,profiles.find(p => p.key === 'regular'),seeded('advice:' + JSON.stringify(c)));
    const label = {fold:'棄牌',check:'過牌',call:'跟注',raise:'加注'};
    return { ...decision, equity:Math.round(eq * 100),potOdds:Math.round(odds * 100),
        reason: c.street === 'pre_flop' ? `${c.positionLabel}：依位置、有效籌碼、公開加注範圍與跟注價格，建議${label[decision.action]}。` :
            `對公開動作推估範圍的勝率約 ${Math.round(eq * 100)}%，可爭取底池的跟注門檻約 ${Math.round(odds * 100)}%；另考慮牌面、聽牌、位置與對手人數，建議${label[decision.action]}。`,
        caveat:'範圍與勝率為抽樣估計，未納入抽水、ICM 或完整下注樹；此為策略建議，非 GTO 最佳解。' };
}
function decide(game, bot, random = Math.random) {
    if (!bot.personality) bot.personality = personality(undefined,random);
    const c = context(game,bot);
    return policy(c,equity(c),bot.personality,random);
}
module.exports = { profiles, personality, context, equity, analyze, decide, seeded, preflopStrength,
    beginHand, observe, opponentRead, boardTexture, handFeatures, policy };
