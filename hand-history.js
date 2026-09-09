const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const strategy = require('./poker-strategy');
const clone = value => JSON.parse(JSON.stringify(value));
const directory = () => process.env.POKER_HISTORY_DIR || path.join(__dirname, '.data', 'hands');
const filename = id => path.join(directory(), createHash('sha256').update(String(id)).digest('hex') + '.json');
const recent = new Map();
function merge(...groups) {
    return [...new Map(groups.flat().map(h => [h.id, h])).values()]
        .sort((a,b) => b.started.localeCompare(a.started)).slice(0,100);
}
function read(id) {
    const memory = recent.get(id) || [];
    try { const data = JSON.parse(fs.readFileSync(filename(id), 'utf8')); return merge(Array.isArray(data) ? data : [], memory); }
    catch (e) { if (e.code !== 'ENOENT') console.error('Hand history read failed:', e.message); return memory; }
}
function begin(game) {
    game.currentHand = { id: randomUUID(), number: (game.handNumber = (game.handNumber || 0) + 1), started: new Date().toISOString(),
        gameId: game.gameId, blinds: clone(game.blinds), scenario: game.practice ? { id: game.practice.id, title: game.practice.title } : null,
        seats: game.activePlayersInRound.map(id => ({ id, name: game.players[id].name, chips: game.players[id].chips + game.players[id].invested,
            hand: game.players[id].hand.map(c => c.toString()), bot: game.players[id].isBot })), actions: [], finished: false };
}
function capture(game, player, action, amount) {
    const c = strategy.context(game, player);
    return { playerId: player.userId, name: player.name, street: game.gameState, board: c.board, pot: c.pot,
        stack: c.stack, call: c.call, position: c.positionLabel, action, amount: action === 'raise' ? amount : action === 'call' ? c.call : 0,
        context: player.isBot ? null : c };
}
function record(game, event) { if (game.currentHand && !game.currentHand.finished) game.currentHand.actions.push(event); }
function finish(game) {
    const hand = game.currentHand;
    if (!hand || hand.finished) return;
    hand.finished = true;
    game.historyError = false;
    for (const seat of hand.seats.filter(p => !p.bot)) {
        const review = { id: hand.id, number: hand.number, started: hand.started, gameId: hand.gameId, scenario: hand.scenario,
            hand: seat.hand, board: game.communityCards.map(c => c.toString()), blinds: hand.blinds,
            pot: game.pot, net: game.players[seat.id].chips - seat.chips, winners: game.winners.map(id => game.players[id].name),
            actions: hand.actions.map(event => {
                const { context, ...publicEvent } = event;
                return { ...publicEvent, mine: event.playerId === seat.id,
                    advice: event.playerId === seat.id && context ? strategy.analyze(context) : null };
            }) };
        const owner = seat.id + ':' + (game.players[seat.id].historyKey || '');
        const records = merge(read(owner), [review]);
        recent.delete(owner); recent.set(owner, records);
        if (recent.size > 256) recent.delete(recent.keys().next().value);
        // The viewer receives only their own completed review, even if disk fails.
        game.completedReviews = game.completedReviews || {};
        game.completedReviews[seat.id] = review;
        try {
            fs.mkdirSync(directory(), { recursive: true });
            const file = filename(seat.id + ':' + (game.players[seat.id].historyKey || '')), temp = file + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(records));
            fs.renameSync(temp, file);
        } catch (e) { game.historyError = true; console.error('Hand history save failed:', e.message); }
    }
}
module.exports = { begin, capture, record, finish, read };
