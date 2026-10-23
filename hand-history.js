const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const strategy = require('./poker-strategy');
const analysis = require('./history-analysis');
const clone = value => JSON.parse(JSON.stringify(value));
const directory = () => process.env.POKER_HISTORY_DIR || path.join(__dirname, '.data', 'hands');
const filename = (id, folder = directory()) => path.join(folder, createHash('sha256').update(String(id)).digest('hex') + '.json');
const recent = new Map();
const writes = new Map(), pending = new Set();
const HISTORY_LIMIT = 500;
function merge(...groups) {
    return [...new Map(groups.flat().map(h => [h.id, h])).values()]
        .sort((a,b) => b.started.localeCompare(a.started)).slice(0,HISTORY_LIMIT);
}
function read(id) {
    const memory = recent.get(id) || [];
    try { const data = JSON.parse(fs.readFileSync(filename(id), 'utf8')); return merge(Array.isArray(data) ? data : [], memory); }
    catch (e) { if (e.code !== 'ENOENT') console.error('Hand history read failed:', e.message); return memory; }
}
function remember(owner, review) {
    const records = merge(recent.get(owner) || [], [review]);
    recent.delete(owner); recent.set(owner, records);
    if (recent.size > 256) recent.delete(recent.keys().next().value);
    return records;
}
function track(task) {
    pending.add(task);
    task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
}
function save(owner, folder, review, game, callback) {
    const file = filename(owner, folder);
    // A player's successive hands and later analysis revisions share one queue.
    const task = (writes.get(file) || Promise.resolve()).then(async () => {
        let disk = [];
        try {
            const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
            if (Array.isArray(data)) disk = data;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        // Memory wins over an older queued revision, including its analysis status.
        const records = merge(disk, [review], recent.get(owner) || []);
        await fs.promises.mkdir(folder, { recursive: true });
        const temporary = file + '.tmp';
        await fs.promises.writeFile(temporary, JSON.stringify(records));
        await fs.promises.rename(temporary, file);
    }).catch(error => {
        game.historyError = true;
        console.error('Hand history save failed:', error.message);
        if (callback) callback();
    });
    writes.set(file, task);
    task.then(() => { if (writes.get(file) === task) writes.delete(file); });
    return track(task);
}
async function flush() {
    while (pending.size) await Promise.allSettled([...pending]);
}
function begin(game) {
    game.currentHand = { id: randomUUID(), number: game.handNumber || 1, started: new Date().toISOString(),
        gameId: game.gameId, blinds: clone(game.blinds), scenario: game.practice ? { id: game.practice.id, title: game.practice.title } : null,
        variant: game.isSlotHand ? { key:'slot_double_board', label:'雙牌面拉霸局', forcedBet:game.blinds.big*4 } : null,
        seats: game.activePlayersInRound.map(id => ({ id, name: game.players[id].name, chips: game.players[id].chips + game.players[id].invested,
            hand: game.players[id].hand.map(c => c.toString()), bot: game.players[id].isBot })), actions: [], finished: false };
    strategy.beginHand(game);
}
function capture(game, player, action, amount) {
    const c = strategy.context(game, player);
    return { playerId: player.userId, name: player.name, street: game.gameState, board: c.board, pot: c.pot,
        stack: c.stack, call: c.call, bet: c.bet, position: c.positionLabel, action, display_action: action === 'raise' && game.currentBetAmount === 0 ? 'bet' : action, amount: action === 'raise' ? amount : action === 'call' ? c.call : 0,
        context: player.isBot ? null : c };
}
function record(game, event) {
    if (game.currentHand && !game.currentHand.finished) {
        game.currentHand.actions.push(event);
        strategy.observe(game, event);
    }
}
function finish(game, onUpdate) {
    const hand = game.currentHand;
    if (!hand || hand.finished) return;
    hand.finished = true;
    game.historyError = false;
    for (const seat of hand.seats.filter(p => !p.bot)) {
        const decisions = hand.actions.map((event, index) => ({ event, index }))
            .filter(({event}) => event.playerId === seat.id && event.context);
        const review = { id: hand.id, number: hand.number, started: hand.started, gameId: hand.gameId, scenario: hand.scenario, variant: hand.variant,
            analysis_status: decisions.length ? 'pending' : 'ready',
            hand: seat.hand, board: game.communityCards.map(c => c.toString()), boards: game.runoutBoards?.length===2?game.runoutBoards.map(board=>board.map(String)):null, blinds: hand.blinds,
            pot: game.pot, net: game.players[seat.id].chips - seat.chips, winners: game.winners.map(id => game.players[id].name),
            actions: hand.actions.map(event => {
                const { context, ...publicEvent } = event;
                return { ...publicEvent, mine: event.playerId === seat.id,
                    advice: null };
            }) };
        const owner = seat.id + ':' + (game.players[seat.id].historyKey || '');
        const folder = directory();
        const notify = () => {
            if (game.completedReviews?.[seat.id]?.id !== review.id || !onUpdate) return;
            try { onUpdate(); }
            catch (error) { console.error('Hand history update failed:', error.message); }
        };
        remember(owner, review);
        // The viewer receives only their own completed review, even if disk fails.
        game.completedReviews = game.completedReviews || {};
        game.completedReviews[seat.id] = review;
        // Keep ownership and storage location from this hand even after a device transfer.
        const update = next => {
            remember(owner, next);
            if (game.completedReviews?.[seat.id]?.id === review.id) {
                game.completedReviews[seat.id] = next;
                notify();
            }
            return save(owner, folder, next, game, notify);
        };
        save(owner, folder, review, game, notify);
        if (decisions.length) track(analysis.analyze(decisions.map(({event}) => event.context)).then(advice => {
            const byIndex = new Map(decisions.map(({index}, i) => [index, advice[i]]));
            return update({ ...review, analysis_status:'ready', actions:review.actions.map((event, index) =>
                byIndex.has(index) ? { ...event, advice:byIndex.get(index) } : event) });
        }, error => {
            console.error('Hand analysis failed:', error.message);
            return update({ ...review, analysis_status:'failed' });
        }));
    }
}
module.exports = { begin, capture, record, finish, read, flush };

