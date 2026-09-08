const { Hand } = require('pokersolver');
const ranks = '23456789TJQKA';
const clamp = (n) => Math.max(0, Math.min(1, n));
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
const cardText = c => typeof c === 'string' ? c : c.rank + c.suit;
function preflopStrength(hand) {
    const [a, b] = hand.map(cardText), hi = Math.max(ranks.indexOf(a[0]), ranks.indexOf(b[0])) + 2;
    const lo = Math.min(ranks.indexOf(a[0]), ranks.indexOf(b[0])) + 2;
    if (hi === lo) return .48 + hi * .035;
    return clamp((hi * 2.5 + lo * 1.5 + (a[1] === b[1] ? 7 : 0) + (hi - lo === 1 ? 4 : 0)) / 85);
}
function context(game, player) {
    const id = player.userId;
    const order = game.playersOrder.filter(i => game.players[i].hand.length === 2);
    const anchor = game.gameState === 'pre_flop' ? game.bigBlindId : game.dealerId;
    const start = order.indexOf(anchor);
    const actionOrder = order.slice(start + 1).concat(order.slice(0, start + 1));
    const opponents = game.activePlayersInRound.filter(i => i !== id && !game.players[i].folded).map(i => ({
        bet: game.players[i].currentBet, stack: game.players[i].chips, invested: game.players[i].invested
    }));
    return { hand: player.hand.map(cardText), board: game.communityCards.map(cardText), street: game.gameState,
        position: actionOrder.length < 2 ? .5 : Math.max(0, actionOrder.indexOf(id)) / (actionOrder.length - 1),
        positionLabel: id === game.dealerId ? 'BTN' : id === game.smallBlindId ? 'SB' : id === game.bigBlindId ? 'BB' : '其他位置',
        pot: game.pot, bet: player.currentBet, call: Math.min(player.chips, Math.max(0, game.currentBetAmount - player.currentBet)),
        target: game.currentBetAmount, minRaise: game.currentBetAmount + game.lastRaiseAmount,
        canRaise: opponents.some(p => p.stack > 0) && (!player.hasActed || game.currentBetAmount - (player.actedAtBet || 0) >= game.lastRaiseAmount),
        stack: player.chips, bb: game.blinds.big, opponents, mode: game.gameMode };
}
// Deterministic unknown-hand sampling. No opponent hole cards or future board.
function equity(c, iterations = 96) {
    const known = new Set([...c.hand, ...c.board]);
    const deck = [...ranks].flatMap(r => [...'shdc'].map(s => r + s)).filter(x => !known.has(x));
    const random = seeded(JSON.stringify(c));
    let wins = 0;
    for (let i = 0; i < iterations; i++) {
        const available = deck.slice();
        const draw = () => available.splice(Math.floor(random() * available.length), 1)[0];
        const hands = c.opponents.map(o => {
            const floor = c.street === 'pre_flop' ? o.bet >= c.bb * 9 ? .62 : o.bet >= c.bb * 3 ? .42 : .12 : .25;
            let hand;
            for (let attempt = 0; attempt < 12; attempt++) {
                hand = [draw(), draw()];
                if (preflopStrength(hand) >= floor || attempt === 11) break;
                available.push(...hand);
            }
            return hand;
        });
        const board = c.board.slice();
        while (board.length < 5) board.push(draw());
        const hero = Hand.solve([...c.hand, ...board]);
        const best = Hand.winners([hero, ...hands.map(h => Hand.solve([...h, ...board]))]);
        if (best.includes(hero)) wins += 1 / best.length;
    }
    return wins / iterations;
}
function analyze(c) {
    const eq = equity(c), odds = c.call / Math.max(1, c.pot + c.call);
    const strength = preflopStrength(c.hand);
    let action;
    if (c.street === 'pre_flop') {
        const opening = c.target <= c.bb;
        const threshold = (opening ? .65 : .70) - c.position * .15;
        action = strength > threshold + .12 ? 'raise' : strength > threshold && eq > odds + .04 ? (opening ? 'raise' : 'call') : c.call ? 'fold' : 'check';
    } else {
        action = eq > .67 + Math.min(.13, (c.opponents.length - 1) * .05) ? 'raise' : c.call ? (eq > odds + .06 ? 'call' : 'fold') : 'check';
    }
    if (action === 'raise' && (!c.canRaise || c.stack + c.bet <= c.target)) action = c.call ? 'call' : 'check';
    const amount = action === 'raise' ? Math.min(c.stack + c.bet, Math.max(c.minRaise, c.street === 'pre_flop' ? c.target > c.bb ? c.target * 3 : c.bb * 3 : c.target + Math.round((c.pot + c.call) * .65))) : 0;
    const label = { fold: '棄牌', check: '過牌', call: '跟注', raise: '加注' };
    return { action, amount, equity: Math.round(eq * 100), potOdds: Math.round(odds * 100),
        reason: c.street === 'pre_flop' ? `${c.positionLabel} 的起手牌強度、前方加注與籌碼深度決定繼續範圍；建議${label[action]}。` :
            `對假設範圍的估計勝率 ${Math.round(eq * 100)}%，跟注門檻 ${Math.round(odds * 100)}%。${action === 'raise' ? '領先範圍時下注取得價值。' : action === 'fold' ? '勝率優勢不足以承擔後續壓力。' : action === 'call' ? '保留對手較弱牌，避免加注只被強牌繼續。' : '控制底池，保留攤牌價值。'}`,
        caveat: '範圍與勝率為抽樣估計，未納入抽水、ICM 或完整下注樹；此為策略建議，非 GTO 最佳解。' };
}
function decide(game, bot, random = Math.random) {
    if (!bot.personality) bot.personality = personality();
    const p = bot.personality, c = context(game, bot), advice = analyze(c);
    const fallback = { action: c.call ? 'fold' : 'check', amount: 0 };
    const call = { action: c.call ? 'call' : 'check', amount: 0 };
    const raise = () => {
        if (!c.canRaise || c.stack + c.bet <= c.target) return call;
        const size = c.street === 'pre_flop' ? (c.target <= c.bb ? c.bb * (2.5 + p.sizing * 2) : c.target * (2.5 + p.sizing)) : c.target + (c.pot + c.call) * p.sizing;
        return { action: 'raise', amount: Math.min(c.stack + c.bet, Math.max(c.minRaise, Math.round(size))) };
    };
    const eq = advice.equity / 100, odds = advice.potOdds / 100;
    if (c.street === 'pre_flop') {
        const strength = preflopStrength(c.hand);
        const threshold = .77 - p.looseness * .32 - c.position * .12 + (c.target > c.bb * 4 ? .14 : 0);
        if (strength < threshold) return fallback;
        if (strength > .89 || random() < p.aggression) return raise();
        return c.call <= c.bb * 4 || eq > odds + .12 - p.looseness * .1 ? call : fallback;
    }
    const edge = .12 - p.looseness * .13;
    if (eq > .72 && random() < .40 + p.aggression * .6) return raise();
    if (c.call > 0 && eq < odds + edge) return fallback;
    if (c.opponents.length === 1 && c.stack > c.pot && random() < p.bluff) return raise();
    if (eq > .52 && !c.call && random() < p.aggression * .6) return raise();
    return call;
}
module.exports = { profiles, personality, context, equity, analyze, decide, seeded, preflopStrength };
