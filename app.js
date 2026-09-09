const PokerBotGTO = require('./bot_gto');
const history = require('./hand-history');
const practice = require('./practice');
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const broadcastState = (gameId) => {
    const game = GAMES[gameId];
    if (!game) return;
    io.in(gameId).fetchSockets().then(sockets => {
        sockets.forEach(socket => {
            socket.emit('game_update', game.toJSON(socket.userId));
        });
    });
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
    const game = GAMES[req.body?.game_id];
    const player = game?.players[req.body?.user_id];
    if (player?.historyKey && player.historyKey !== req.get('X-History-Key')) return res.status(403).json({ success: false, message: '座位驗證失敗，請使用原本的瀏覽器' });
    next();
});

// --- Poker Logic ---

class Card {
    static SUITS = ['s', 'h', 'd', 'c'];
    static RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    static RANK_VALUES = (() => {
        const values = {};
        this.RANKS.forEach((rank, i) => values[rank] = i);
        return values;
    })();

    constructor(rank, suit) {
        this.rank = rank;
        this.suit = suit;
    }
    toString() { return `${this.rank}${this.suit}`; }
}

class Deck {
    constructor() {
        this.cards = [];
        for (const suit of Card.SUITS) {
            for (const rank of Card.RANKS) {
                this.cards.push(new Card(rank, suit));
            }
        }
        this.shuffle();
    }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    deal(numCards) {
        if (this.cards.length < numCards) throw new Error("Not enough cards");
        return this.cards.splice(-numCards);
    }
}

class Player {
    constructor(userId, name, chips) {
        this.userId = userId;
        this.name = name;
        this.chips = chips;
        this.hand = [];
        this.currentBet = 0;
        this.folded = false;
        this.allIn = false;
        this.sittingOut = false;
        this.isBot = false;
        this.lastAction = null;
        this.hasActed = false; // New! Ensure they acted this round
        this.invested = 0; // Total invested in this hand
        this.avatar = '';
    }
    resetForNewRound() {
        this.hand = [];
        this.currentBet = 0;
        this.folded = false;
        this.allIn = false;
        this.lastAction = null;
        this.hasActed = false;
        this.invested = 0;
    }
    canBet() { return !this.folded && !this.allIn && !this.sittingOut && this.chips > 0; }
}


class TournamentManager {
    constructor(config, blindSchedule) {
        this.config = config || { startingChips: 10000, maxReEntry: 2, reEntryCutoffLevel: 6 };
        this.blindSchedule = blindSchedule || [
            { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 600 },
            { level: 2, smallBlind: 75, bigBlind: 150, ante: 0, durationSeconds: 600 },
            { level: 3, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 600 },
            { level: 4, smallBlind: 150, bigBlind: 300, ante: 25, durationSeconds: 600 },
            { level: 5, smallBlind: 200, bigBlind: 400, ante: 50, durationSeconds: 600 },
            { level: 6, smallBlind: 300, bigBlind: 600, ante: 75, durationSeconds: 600 },
            { level: 7, smallBlind: 400, bigBlind: 800, ante: 100, durationSeconds: 600 },
            { level: 8, smallBlind: 500, bigBlind: 1000, ante: 100, durationSeconds: 600 },
            { level: 9, smallBlind: 600, bigBlind: 1200, ante: 200, durationSeconds: 600 }
        ];
        
        this.currentLevelIndex = 0;
        this.levelStartTime = 0;
        this.playersStats = {};
        this.eliminatedRanks = [];
        this.started = false;
    }

    initPlayer(playerId) {
        if (!this.playersStats[playerId]) {
            this.playersStats[playerId] = {
                playerId: playerId,
                reEntriesUsed: 0,
                isEliminated: false,
                rank: null
            };
        }
    }

    startTournament() {
        if (!this.started) {
            this.levelStartTime = Date.now();
            this.started = true;
        }
    }

    getCurrentBlind() {
        return this.blindSchedule[Math.min(this.currentLevelIndex, this.blindSchedule.length - 1)];
    }

    getRemainingTime() {
        if (!this.started) return this.getCurrentBlind().durationSeconds;
        const now = Date.now();
        const elapsedSeconds = (now - this.levelStartTime) / 1000;
        return Math.max(0, this.getCurrentBlind().durationSeconds - Math.floor(elapsedSeconds));
    }

    checkAndUpgradeBlinds() {
        if (!this.started) return false;
        const currentLevel = this.getCurrentBlind();
        const now = Date.now();
        const elapsedSeconds = (now - this.levelStartTime) / 1000;

        if (elapsedSeconds >= currentLevel.durationSeconds && 
            this.currentLevelIndex < this.blindSchedule.length - 1) {
            
            this.currentLevelIndex++;
            this.levelStartTime = now;
            return true;
        }
        return false;
    }

    handlePlayerBust(playerId, totalPlayers) {
        const stats = this.playersStats[playerId];
        if (!stats) return 'ELIMINATED';

        const currentLevel = this.getCurrentBlind();
        const isReEntryOpen = currentLevel.level <= this.config.reEntryCutoffLevel;

        if (isReEntryOpen && stats.reEntriesUsed < this.config.maxReEntry) {
            return 'CAN_REENTRY';
        } else {
            if (!stats.isEliminated) {
                stats.isEliminated = true;
                this.eliminatedRanks.push(playerId);
                stats.rank = totalPlayers - this.eliminatedRanks.length + 1;
            }
            return 'ELIMINATED';
        }
    }

    executeReEntry(playerId) {
        const stats = this.playersStats[playerId];
        if (stats) {
            stats.reEntriesUsed++;
            return this.config.startingChips;
        }
        return 0;
    }
}

class TexasHoldemGame {
    constructor(gameId, hostUserId, hostName, initialChips = 1000, gameMode = "cash", smallBlind = 10, blindDuration = 600, maxReEntry = 2) {
        this.gameId = gameId;
        this.gameMode = gameMode;
        
        const sbMults = [1, 1.5, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 120, 160, 200, 300, 400, 600];
        const anteMults = [0, 0, 0.5, 0.5, 1, 1.5, 2, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 100];
        const defaultSchedule = [];
        for (let i = 0; i < 20; i++) {
            defaultSchedule.push({
                level: i + 1,
                smallBlind: Math.floor(smallBlind * sbMults[i]),
                bigBlind: Math.floor(smallBlind * sbMults[i]) * 2,
                ante: Math.floor(smallBlind * anteMults[i]),
                durationSeconds: blindDuration
            });
        }
        this.tournamentManager = gameMode === "tournament" ? new TournamentManager({ startingChips: initialChips, maxReEntry: maxReEntry, reEntryCutoffLevel: 6 }, defaultSchedule) : null;

        this.initialChips = initialChips;
        this.players = {};
        this.playersOrder = [];
        this.activePlayersInRound = [];
        this.communityCards = [];
        this.deck = null;
        this.pot = 0;
        this.dealerPos = -1; // index in playersOrder
        this.dealerId = null;
        this.smallBlindId = null;
        this.bigBlindId = null;
        this.currentBetAmount = 0;
        this.currentPlayerIdx = 0;
        this.gameState = 'waiting_for_players';
        this.messages = [];
        this.blinds = { small: parseInt(smallBlind), big: parseInt(smallBlind) * 2 };
        this.winners = [];
        this.actionCount = 0;
        this.latestVoice = '';
        this.turnDeadline = 0;
        this.turnTimeout = null;
        this.lastRaiseAmount = 20; // 追蹤上一次加注的增量，初始為大盲

        this.addPlayer(hostUserId, hostName);
    }

    
    handleDisconnect(userId) {
        const p = this.players[userId];
        if (!p || p.sittingOut) return;
        p.sittingOut = true;
        this.messages.push(`${p.name} 斷線離開了牌桌`);
        
        if (['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) {
            if (!p.folded && !p.allIn) {
                history.record(this, history.capture(this, p, 'fold', 0));
                // To avoid bugs, we just fold the disconnected player immediately
                p.folded = true;
                this.messages.push(`${p.name} 因斷線自動蓋牌`);
                
                // If it was their turn, move to next
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === userId) {
                    if (this.checkEndBetting()) {
                        this.endBettingRound();
                    } else {
                        if (this.moveToNextPlayer()) {
                            this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
                            this.startTurnTimer();
                        } else {
                            this.endBettingRound();
                        }
                    }
                } else {
                    if (this.checkEndBetting()) {
                        this.endBettingRound();
                    }
                }
            }
        }
        
        this.checkEmptyRoom();
    }

    checkEmptyRoom() {
        const humanPlayers = this.playersOrder.filter(id => !this.players[id].isBot);
        const hasActiveHuman = humanPlayers.some(id => !this.players[id].sittingOut);
        if (!hasActiveHuman) {
            if (!this.emptyTimeout) {
                this.emptyTimeout = setTimeout(() => {
                    console.log(`Destroying empty room ${this.gameId}`);
                    delete GAMES[this.gameId];
                }, 5000);
            }
        } else {
            if (this.emptyTimeout) {
                clearTimeout(this.emptyTimeout);
                this.emptyTimeout = null;
            }
        }
    }

    addPlayer(userId, name, avatar = '') {
        if (this.playersOrder.length >= 8) return [false, "房間已滿"];
        if (this.players[userId]) return [false, "你已經在房間中"];

        const player = new Player(userId, name, this.initialChips);
        player.avatar = avatar;
        
        // 如果遊戲已開始，新玩家下一局才能玩；如果還沒開始，可以直接玩
        if (this.gameState !== 'waiting_for_players' && this.gameState !== 'game_over') {
            player.sittingOut = true; 
            player.waitingForNextRound = true;
            this.messages.push(`${name} 加入了遊戲 (將於下一局參與)。`);
        } else {
            player.sittingOut = false;
            this.messages.push(`${name} 加入了遊戲。`);
        }
        
        this.players[userId] = player;
        if (this.tournamentManager) this.tournamentManager.initPlayer(userId);
        this.playersOrder.push(userId);
        
        // Broadcast the updated state so everyone sees the new player immediately
        return [true, "成功加入"];
    }

    addBot() {
        if (this.playersOrder.length >= 8) return [false, "牌桌已滿"];
        const botId = 'bot_' + Math.random().toString(36).substr(2, 6);
        const botNames = ['Bot 艾蜜莉', 'Bot 查理', 'Bot 丹尼', 'Bot 艾力克斯', 'Bot 布萊恩', 'Bot 菲力普', 'Bot 葛瑞絲', 'Bot 漢娜', 'Bot 伊凡'];
        const botAvatars = ['👱‍♀️', '👨‍', '👦', '🧔', '👱‍♂️', '👨‍🦱', '👩‍🦰', '👩‍🦱', '👲'];
        const botName = botNames[this.playersOrder.length % botNames.length];
        const botAvatar = botAvatars[this.playersOrder.length % botAvatars.length];
        const [ok, msg] = this.addPlayer(botId, botName, botAvatar);
        if (ok) { this.players[botId].isBot = true; this.players[botId].personality = PokerBotGTO.personality(); }
        return [ok, msg];
    }

    startGame() {
        if (this.gameState !== 'waiting_for_players') return [false, "無法開始"];
        if (this.playersOrder.length < 2) return [false, "人數不足"];

        this.messages.push("遊戲開始！");
        this.startNewRound();
        return [true, "遊戲已開始"];
    }

    startNewRound() {
        if (!['waiting_for_players', 'waiting_for_next_round', 'game_over'].includes(this.gameState)) return;
        this.cancelScheduledAction();
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.currentBetAmount = 0;
        this.winners = [];
        
        if (this.tournamentManager) {
            this.tournamentManager.startTournament();
            const upgraded = this.tournamentManager.checkAndUpgradeBlinds();
            const currentBlind = this.tournamentManager.getCurrentBlind();
            this.blinds = { small: currentBlind.smallBlind, big: currentBlind.bigBlind };
            if (upgraded) {
                this.messages.push(`[錦標賽] 盲注升級至 ${this.blinds.small}/${this.blinds.big}`);
            }
        }
        
        Object.values(this.players).forEach(p => {
            if (p.waitingForNextRound) {
                p.waitingForNextRound = false;
                p.sittingOut = false;
            }
            if (!p.sittingOut && p.chips > 0) p.resetForNewRound();
            else p.folded = true;
        });

        const validIds = this.playersOrder.filter(id => !this.players[id].sittingOut && this.players[id].chips > 0);
        if (validIds.length < 2) {
            this.gameState = 'game_over';
            this.messages.push("玩家不足，遊戲結束。");
            return;
        }

        // Advance Dealer
        this.dealerPos = (this.dealerPos + 1) % this.playersOrder.length;
        while (!validIds.includes(this.playersOrder[this.dealerPos])) {
             this.dealerPos = (this.dealerPos + 1) % this.playersOrder.length;
        }
        
        this.dealerId = this.playersOrder[this.dealerPos];
        const dealerInValid = validIds.indexOf(this.dealerId);
        
        let sbIdx = (dealerInValid + 1) % validIds.length;
        let bbIdx = (dealerInValid + 2) % validIds.length;
        if (validIds.length === 2) {
            sbIdx = dealerInValid; // In Heads-up, Dealer is SB
            bbIdx = (dealerInValid + 1) % validIds.length;
        }

        this.smallBlindId = validIds[sbIdx];
        this.bigBlindId = validIds[bbIdx];

        this.gameState = 'pre_flop';
        this.activePlayersInRound = [...validIds];

        // Deal Cards
        for (let i = 0; i < 2; i++) {
            this.activePlayersInRound.forEach(id => {
                this.players[id].hand.push(...this.deck.deal(1));
            });
        }

        history.begin(this);
        this.activePlayersInRound.forEach(id => { if (this.players[id].personality) this.players[id].personality.handsPlayed++; });

        // Post Blinds
        this.postBlind(this.players[this.smallBlindId], this.blinds.small);
        this.postBlind(this.players[this.bigBlindId], this.blinds.big);
        this.currentBetAmount = this.blinds.big;
        this.lastRaiseAmount = this.blinds.big; // 翻牌前的最低加注增量是一次大盲

        this.messages.push(`莊家: ${this.players[this.dealerId].name}`);

        // Pre-flop: Action starts left of BB (UTG)
        this.currentPlayerIdx = this.activePlayersInRound.indexOf(this.bigBlindId);
        if (!this.moveToNextPlayer()) { this.endBettingRound(); return; }

        this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
        this.startTurnTimer();
    }

    postBlind(player, amount) {
        const bet = Math.min(amount, player.chips);
        player.chips -= bet;
        player.currentBet += bet;
        player.invested += bet;
        this.pot += bet;
        if (player.chips === 0) player.allIn = true;
        this.messages.push(`${player.name} 下注 $${bet} (盲注)`);
    }

    getCurrentPlayer() {
        return this.players[this.activePlayersInRound[this.currentPlayerIdx]];
    }

    moveToNextPlayer() {
        let attempts = 0;
        while (attempts < this.activePlayersInRound.length) {
            this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.activePlayersInRound.length;
            const p = this.getCurrentPlayer();
            if (!p.folded && !p.allIn) return true;
            attempts++;
        }
        return false;
    }

    checkEndBetting() {
        const active = this.activePlayersInRound.filter(id => !this.players[id].folded);
        if (active.length === 1) return true; // Single winner

        const canAct = active.filter(id => !this.players[id].allIn);
        // Standard rule: all non-all-in active players must have acted AND matched the current bet.
        return canAct.every(id => {
             const p = this.players[id];
             return p.hasActed && p.currentBet === this.currentBetAmount;
        });
    }

    endRoundSingleWinner() {
        if (this.turnTimeout) clearTimeout(this.turnTimeout);
        this.turnDeadline = 0;
        const winnerId = this.activePlayersInRound.find(id => !this.players[id].folded);
        const winner = this.players[winnerId];
        winner.chips += this.pot;
        this.winners = [winnerId];
        this.messages.push(`${winner.name} 獲勝，贏得 ${this.pot} (其他玩家棄牌)`);
        
        this.actionCount++;
        this.latestVoice = 'winner';
        this.gameState = 'showdown';
        history.finish(this);
        
        broadcastState(this.gameId);
        this.scheduleAction('next', 4000);
    }

    endBettingRound() {
        if (!['pre_flop','flop','turn','river'].includes(this.gameState)) return;
        this.cancelScheduledAction();
        this.messages.push("下注回合結束");
        this.currentBetAmount = 0;
        this.lastRaiseAmount = this.blinds.big; // 新回合最低加注至少是一個大盲
        
        // Reset player round state
        this.activePlayersInRound.forEach(id => {
             const p = this.players[id];
             p.currentBet = 0;
             p.lastAction = null;
             p.hasActed = false;
        });

        this.activePlayersInRound = this.activePlayersInRound.filter(id => !this.players[id].folded);

        if (this.activePlayersInRound.length === 1) return this.endRoundSingleWinner();

        if (this.gameState === 'pre_flop') {
            this.gameState = 'flop';
            this.communityCards.push(...this.deck.deal(3));
            this.messages.push(`發出翻牌`);
        } else if (this.gameState === 'flop') {
            this.gameState = 'turn';
            this.communityCards.push(...this.deck.deal(1));
            this.messages.push(`發出轉牌`);
        } else if (this.gameState === 'turn') {
            this.gameState = 'river';
            this.communityCards.push(...this.deck.deal(1));
            this.messages.push(`發出河牌`);
        } else if (this.gameState === 'river') {
            this.determineWinner();
            return;
        }

        // Post-flop: Action starts with the first active player left of the dealer
        // Set index to dealer, then move to next
        const dealerIdxInActive = this.activePlayersInRound.indexOf(this.dealerId);
        if (dealerIdxInActive !== -1) {
            this.currentPlayerIdx = dealerIdxInActive;
        } else {
            // Dealer folded, find closest left
            let startIdx = this.playersOrder.indexOf(this.dealerId);
            for (let i = 1; i <= this.playersOrder.length; i++) {
                const checkId = this.playersOrder[(startIdx + i) % this.playersOrder.length];
                if (this.activePlayersInRound.includes(checkId)) {
                    // Set to one before it, so moveToNextPlayer lands on it
                    this.currentPlayerIdx = (this.activePlayersInRound.indexOf(checkId) - 1 + this.activePlayersInRound.length) % this.activePlayersInRound.length;
                    break;
                }
            }
        }

        const canActCount = this.activePlayersInRound.filter(id => !this.players[id].allIn).length;
        if (canActCount <= 1) {
             // Auto-deal remaining cards if everyone is all-in
             broadcastState(this.gameId);
             this.turnDeadline = 0;
             this.scheduleAction('runout', 1500);
             return;
        }

        if (this.moveToNextPlayer()) {
            this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
            this.startTurnTimer();
        }
    }

    playerAction(userId, action, amount = 0) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState) || !this.getCurrentPlayer() || userId !== this.getCurrentPlayer().userId) return [false, '不輪到你'];
        const player = this.players[userId];
        let success = false;
        let msg = "";

        if (player.folded || player.allIn || player.sittingOut) return [false, '目前無法行動'];
        if (!['fold', 'check', 'call', 'raise'].includes(action)) return [false, '無效操作'];
        if (action === 'raise' && (!Number.isSafeInteger(amount) || amount <= this.currentBetAmount)) return [false, '加注總額必須為有效整數且高於目前下注'];
        if (action === 'raise' && player.hasActed && this.currentBetAmount - (player.actedAtBet || 0) < this.lastRaiseAmount) return [false, '不足額全下尚未重新開放加注'];
        if (action === 'raise' && !this.activePlayersInRound.some(id => id !== userId && this.players[id].canBet())) return [false, '沒有可跟注的對手'];
        const event = history.capture(this, player, action, amount);

        if (action === 'fold') {
            player.folded = true;
            msg = `${player.name} 蓋牌`;
            success = true;
        } else if (action === 'check') {
            if (this.currentBetAmount > player.currentBet) return [false, "不可過牌，必須跟注或加注"];
            msg = `${player.name} 過牌`;
            success = true;
        } else if (action === 'call') {
            const need = this.currentBetAmount - player.currentBet;
            const bet = Math.min(need, player.chips);
            player.chips -= bet;
            player.currentBet += bet;
            player.invested += bet;
            this.pot += bet;
            if (player.chips === 0) player.allIn = true;
            msg = `${player.name} 跟注 $${bet}`;
            success = true;
        } else if (action === 'raise') {
            const minRaise = this.currentBetAmount + this.lastRaiseAmount;
            const totalToPutIn = amount - player.currentBet;
            
            // 允許籌碼不夠時的全下，否則必須滿足最低加注金額
            if (amount < minRaise && player.chips > totalToPutIn) {
                return [false, `最低加注總額必須為 $${minRaise}`];
            }
            if (player.chips < totalToPutIn) return [false, "籌碼不足"];

            const actualRaise = amount - this.currentBetAmount;
            if (actualRaise > this.lastRaiseAmount) {
                this.lastRaiseAmount = actualRaise; // 更新下一個人的最低加注門檻
            }

            player.chips -= totalToPutIn;
            player.currentBet += totalToPutIn;
            player.invested += totalToPutIn;
            this.pot += totalToPutIn;
            this.currentBetAmount = amount;
            if (player.chips === 0) player.allIn = true;
            msg = `${player.name} 加注至 $${amount}`;
            success = true;

            // Everyone else needs to act again to match the new bet
            this.activePlayersInRound.forEach(id => {
                if (id !== userId && actualRaise >= this.lastRaiseAmount) this.players[id].hasActed = false;
            });
        }

        if (success) {
            this.cancelScheduledAction();
            player.hasActed = true;
            player.actedAtBet = this.currentBetAmount;
            history.record(this, event);
            player.lastAction = action;
            this.actionCount++;
            this.latestVoice = player.allIn ? 'all in' : action;
            this.messages.push(msg);
            
            if (this.checkEndBetting()) {
                 this.endBettingRound();
            } else {
                 if (this.moveToNextPlayer()) {
                     this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
                     this.startTurnTimer();
                 } else {
                     this.endBettingRound(); // Fallback
                 }
            }
            return [true, msg];
        }
        return [false, "無效操作"];
    }


    cancelScheduledAction() {
        if (this.turnTimeout) clearTimeout(this.turnTimeout);
        this.turnTimeout = null;
        this.scheduledAction = null;
    }

    scheduleAction(kind, delay) {
        this.cancelScheduledAction();
        this.scheduledAction = { kind, due: Date.now() + delay, hand: this.handNumber,
            street: this.gameState, playerId: this.getCurrentPlayer()?.userId };
        this.turnTimeout = setTimeout(() => this.advanceDueAction(), delay);
    }

    // HTTP synchronization also drives overdue work when a host suspends timers.
    // Consume before executing, so a timer and a polling request cannot act twice.
    advanceDueAction(now = Date.now()) {
        const pending = this.scheduledAction;
        if (!pending || pending.due > now) return;
        this.cancelScheduledAction();
        if (pending.hand !== this.handNumber || pending.street !== this.gameState) return;
        if (pending.kind === 'next') this.prepareNext();
        else if (pending.kind === 'runout') this.endBettingRound();
        else {
            const player = this.getCurrentPlayer();
            if (!player || player.userId !== pending.playerId || !player.canBet()) return;
            if (player.isBot) this.makeBotDecision(player);
            else this.playerAction(player.userId, this.currentBetAmount > player.currentBet ? 'fold' : 'check');
        }
        broadcastState(this.gameId);
    }

    startTurnTimer() {
        this.cancelScheduledAction();
        this.turnDeadline = 0;
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) return;
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || !currentPlayer.canBet()) return;
        if (!this.practice || currentPlayer.isBot) {
            const delay = currentPlayer.isBot ? 3000 : 20000;
            this.turnDeadline = Date.now() + delay;
            this.scheduleAction('turn', delay);
        }
        broadcastState(this.gameId);
    }

    makeBotDecision(bot) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState) || bot.allIn || bot.folded) return;
        
        // Use GTO logic for decision
        let decision;
        try { decision = PokerBotGTO.decide(this, bot); }
        catch (error) {
            console.error('Bot decision failed:', error.message);
            decision = { action: this.currentBetAmount > bot.currentBet ? 'fold' : 'check', amount: 0 };
        }
        
        let action = decision.action;
        let amount = decision.amount;

        // Fallback safety
        if (action === 'raise' && bot.chips < (amount - bot.currentBet)) {
            if (bot.chips + bot.currentBet > (this.currentBetAmount - bot.currentBet)) {
                amount = bot.chips + bot.currentBet;
            } else {
                action = 'call';
            }
        }

        // console.log(`[GTO Bot] ${bot.name} (Hand: ${bot.hand.map(c=>c.rank+c.suit).join(',')}) Action: ${action}, Amount: ${amount}`);
        const res = this.playerAction(bot.userId, action, amount);
        if (res && res[0] === false) {
             // force fold if invalid
             this.playerAction(bot.userId, this.currentBetAmount > bot.currentBet ? 'fold' : 'check');
        }
    }

    evaluateHand(cards) {
        if (cards.length < 5) return { score: 0, desc: "無效牌" };
        
        const eval5 = (fiveCards) => {
            const values = fiveCards.map(c => Card.RANK_VALUES[c.rank]).sort((a,b) => b - a);
            const suits = fiveCards.map(c => c.suit);
            const isFlush = suits.every(s => s === suits[0]);
            
            let isStraight = true;
            for(let i=0; i<4; i++) {
                if (values[i] - 1 !== values[i+1]) isStraight = false;
            }
            let isLowStraight = false;
            if (values[0]===12 && values[1]===3 && values[2]===2 && values[3]===1 && values[4]===0) {
                isStraight = true;
                isLowStraight = true;
            }

            const counts = {};
            values.forEach(v => counts[v] = (counts[v] || 0) + 1);
            let four= -1, three= -1, pairs= [], kickers= [];
            for (const [vStr, count] of Object.entries(counts)) {
                const v = parseInt(vStr);
                if (count === 4) four = v;
                else if (count === 3) three = v;
                else if (count === 2) pairs.push(v);
                else kickers.push(v);
            }
            pairs.sort((a,b) => b - a);
            kickers.sort((a,b) => b - a);

            const getKickerScore = (arr) => {
                let res = 0;
                for(let i=0; i<arr.length; i++) {
                    res += arr[i] * Math.pow(15, arr.length - 1 - i);
                }
                return res;
            };

            let score = 0, desc = "";
            if (isFlush && isStraight) {
                const highRank = isLowStraight ? 3 : values[0];
                score = 80000000 + highRank;
                desc = "同花順";
            } else if (four !== -1) {
                score = 70000000 + four * 15 + kickers[0];
                desc = "鐵支";
            } else if (three !== -1 && pairs.length > 0) {
                score = 60000000 + three * 15 + pairs[0];
                desc = "葫蘆";
            } else if (isFlush) {
                score = 50000000 + getKickerScore(values);
                desc = "同花";
            } else if (isStraight) {
                const highRank = isLowStraight ? 3 : values[0];
                score = 40000000 + highRank;
                desc = "順子";
            } else if (three !== -1) {
                score = 30000000 + three * 225 + getKickerScore(kickers);
                desc = "三條";
            } else if (pairs.length >= 2) {
                score = 20000000 + pairs[0] * 225 + pairs[1] * 15 + kickers[0];
                desc = "兩對";
            } else if (pairs.length === 1) {
                score = 10000000 + pairs[0] * 3375 + getKickerScore(kickers);
                desc = "一對";
            } else {
                score = getKickerScore(values);
                desc = "高牌";
            }
            return { score, desc };
        };

        const getCombinations = (array, size) => {
            const result = [];
            const helper = (start, combo) => {
                if (combo.length === size) {
                    result.push([...combo]);
                    return;
                }
                for (let i = start; i < array.length; i++) {
                    combo.push(array[i]);
                    helper(i + 1, combo);
                    combo.pop();
                }
            };
            helper(0, []);
            return result;
        };

        let bestScore = -1, bestDesc = "";
        const combos = getCombinations(cards, 5);
        for (const combo of combos) {
            const res = eval5(combo);
            if (res.score > bestScore) {
                bestScore = res.score;
                bestDesc = res.desc;
            }
        }
        return { score: bestScore, desc: bestDesc };
    }

    determineWinner() {
        if (this.turnTimeout) clearTimeout(this.turnTimeout);
        this.turnDeadline = 0;
        const investors = Object.values(this.players).filter(p => (p.invested || 0) > 0);
        const uniqueInvestments = [...new Set(investors.map(p => p.invested))].sort((a, b) => a - b);
        let previousInvested = 0;
        const subPots = [];

        for (const level of uniqueInvestments) {
            const contribution = level - previousInvested;
            let subPotAmount = 0;
            const eligiblePlayers = [];
            for (const p of investors) {
                if (p.invested >= level) {
                    subPotAmount += contribution;
                    if (!p.folded && !p.sittingOut) {
                        eligiblePlayers.push(p);
                    }
                }
            }
            if (subPotAmount > 0) {
                subPots.push({ amount: subPotAmount, eligiblePlayers });
            }
            previousInvested = level;
        }

        const eligibleToWin = Object.values(this.players).filter(p => !p.folded && !p.sittingOut);
        const playerScores = new Map();
        eligibleToWin.forEach(p => {
            const evalResult = this.evaluateHand([...p.hand, ...this.communityCards]);
            playerScores.set(p, { score: evalResult.score, desc: evalResult.desc });
        });

        const winnings = new Map();
        let winnersList = [];

        for (const pot of subPots) {
            if (pot.eligiblePlayers.length === 0) continue;
            let maxScore = -1;
            for (const p of pot.eligiblePlayers) {
                const score = playerScores.get(p).score;
                if (score > maxScore) maxScore = score;
            }
            const potWinners = pot.eligiblePlayers.filter(p => playerScores.get(p).score === maxScore);
            const share = Math.floor(pot.amount / potWinners.length);
            let remainder = pot.amount % potWinners.length;
            potWinners.sort((a,b) => ((this.playersOrder.indexOf(a.userId)-this.dealerPos-1+this.playersOrder.length)%this.playersOrder.length)-((this.playersOrder.indexOf(b.userId)-this.dealerPos-1+this.playersOrder.length)%this.playersOrder.length));
            potWinners.forEach(w => {
                winnings.set(w, (winnings.get(w) || 0) + share + (remainder-- > 0 ? 1 : 0));
                if (!winnersList.includes(w)) winnersList.push(w);
            });
        }

        this.winners = winnersList.map(w => w.userId);
        const winnerMessages = [];
        for (const [w, amount] of winnings.entries()) {
            w.chips += amount;
            const desc = playerScores.get(w).desc;
            winnerMessages.push(`${w.name} (${desc}) 贏得 ${amount}`);
        }
        this.messages.push(`結算: ${winnerMessages.join(', ')}`);

        this.gameState = 'showdown';
        history.finish(this);
        this.actionCount++;
        this.latestVoice = 'winner';
        
        broadcastState(this.gameId);
        this.scheduleAction('next', 6000);
    }

    prepareNext() {
        const busted = Object.keys(this.players).filter(id => this.players[id].chips === 0 && !this.players[id].sittingOut);
        busted.forEach(id => {
            if (this.tournamentManager) {
                const totalPlayers = Object.keys(this.players).length;
                const status = this.tournamentManager.handlePlayerBust(id, totalPlayers);
                if (status === 'CAN_REENTRY') {
                    if (this.players[id].isBot) {
                        this.players[id].chips = this.tournamentManager.executeReEntry(id);
                        this.messages.push(`[錦標賽] ${this.players[id].name} 自動 Re-entry`);
                    } else {
                        this.players[id].sittingOut = true;
                        this.messages.push(`[錦標賽] ${this.players[id].name} 籌碼歸零，可選擇 Re-entry`);
                    }
                } else {
                    this.players[id].sittingOut = true;
                    const rank = this.tournamentManager.playersStats[id].rank;
                    this.messages.push(`[錦標賽] ${this.players[id].name} 遭到淘汰！名次：第 ${rank} 名`);
                }
            } else {
                if (this.players[id].isBot) {
                    this.players[id].chips = this.initialChips;
                    this.messages.push(`${this.players[id].name} 已自動買入 ${this.initialChips}`);
                } else {
                    this.players[id].sittingOut = true;
                    this.messages.push(`${this.players[id].name} 籌碼歸零，請手動買入`);
                }
            }
        });

        const activePlayers = this.playersOrder.filter(id => !this.players[id].sittingOut);
        
        if (activePlayers.length < 2) {
            this.gameState = 'game_over';
            if (this.tournamentManager && activePlayers.length === 1) {
                const winnerId = activePlayers[0];
                this.messages.push(`[錦標賽] 恭喜 ${this.players[winnerId].name} 獲得冠軍！`);
            } else {
                this.messages.push("剩餘玩家不足，遊戲結束。");
            }
        } else {
            this.gameState = 'waiting_for_next_round';
        }
    }

    toJSON(userId) {
        this.snapshotVersion = (this.snapshotVersion || 0) + 1;
        return {
            snapshot_version: this.snapshotVersion,
            viewer_id: userId,
            hand_number: this.handNumber || 0,
            blinds: this.blinds,
            history_error: this.historyError || false,
            practice: this.practice ? { id: this.practice.id, title: this.practice.title, prompt: this.practice.prompt, lesson: this.currentHand?.finished ? this.practice.lesson : null } : null,
            game_id: this.gameId,
            game_mode: this.gameMode,
            game_state: this.gameState,
            tournament_info: this.tournamentManager ? {
                level: this.tournamentManager.getCurrentBlind().level,
                smallBlind: this.tournamentManager.getCurrentBlind().smallBlind,
                bigBlind: this.tournamentManager.getCurrentBlind().bigBlind,
                ante: this.tournamentManager.getCurrentBlind().ante,
                remaining_seconds: this.tournamentManager.getRemainingTime(),
                playersStats: this.tournamentManager.playersStats,
                maxReEntry: this.tournamentManager.config.maxReEntry
            } : null,
            pot: this.pot,
            current_bet_amount: this.currentBetAmount,
            turn_deadline: this.turnDeadline,
            min_raise: this.currentBetAmount + this.lastRaiseAmount,
            community_cards: this.communityCards.map(c => c.toString()),
            current_player_id: ['pre_flop','flop','turn','river'].includes(this.gameState) && this.scheduledAction?.kind !== 'runout' && this.getCurrentPlayer()?.canBet() ? this.getCurrentPlayer().userId : null,
            winners: this.winners,
            action_count: this.actionCount || 0,
            latest_voice: this.latestVoice || '',
            last_messages: this.messages.slice(-5),
            dealer_id: this.dealerId,
            sb_id: this.smallBlindId,
            bb_id: this.bigBlindId,
            players: this.playersOrder.map(id => {
                const p = this.players[id];
                const showCards = p.userId === userId || (this.gameState === 'showdown' && !p.folded && this.activePlayersInRound.length > 1);
                return {
                    user_id: p.userId,
                    bot_style: p.isBot ? p.personality?.label : null,
                    can_raise: !p.hasActed || this.currentBetAmount - (p.actedAtBet || 0) >= this.lastRaiseAmount,
                    name: p.name,
                    avatar: p.avatar,
                    chips: p.chips,
                    current_bet: p.currentBet,
                    folded: p.folded,
                    all_in: p.allIn,
                    last_action: p.lastAction,
                    is_current_player: p.userId === (this.getCurrentPlayer() ? this.getCurrentPlayer().userId : null),
                    hand: showCards ? p.hand.map(c => c.toString()) : (p.hand.length > 0 ? ['??', '??'] : [])
                };
            })
        };
    }
}

// --- API Endpoints ---

const GAMES = {};

app.post('/create_game', (req, res) => {
    const { user_id, user_name, initial_chips, avatar, game_mode, small_blind, blind_duration, max_re_entry } = req.body;
    const chips = parseInt(initial_chips) || 1000;
    const gameId = Math.random().toString(36).substr(2, 8).toUpperCase();
    GAMES[gameId] = new TexasHoldemGame(gameId, user_id, user_name, chips, game_mode || "cash", parseInt(small_blind) || 10, parseInt(blind_duration) || 600, parseInt(max_re_entry) ?? 2);
    GAMES[gameId].players[user_id].historyKey = req.get('X-History-Key') || '';
    if (avatar) GAMES[gameId].players[user_id].avatar = avatar;
    res.json({ success: true, game_id: gameId, game_state: GAMES[gameId].toJSON(user_id) });
    broadcastState(gameId);
});

app.post('/join_game', (req, res) => {
    const { game_id, user_id, user_name, avatar } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: "房號不存在" });
    if (game.players[user_id]) {
        if (game.players[user_id].historyKey && game.players[user_id].historyKey !== req.get('X-History-Key')) return res.status(403).json({ success: false, message: '請使用原本的瀏覽器加入此座位' });
        // Already in game, just allow reconnect
        game.players[user_id].name = user_name || game.players[user_id].name;
        if (avatar) game.players[user_id].avatar = avatar;
        return res.json({ success: true, message: "重新連線", game_state: game.toJSON(user_id) });
    }
    const [ok, msg] = game.addPlayer(user_id, user_name, avatar);
    if (ok) game.players[user_id].historyKey = req.get('X-History-Key') || '';
    res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });
    broadcastState(game_id);
});

app.post('/add_bot', (req, res) => {
    const { game_id, user_id } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: "房號不存在" });
    if (game.playersOrder[0] !== user_id) return res.status(403).json({ success: false, message: "限房主操作" });
    const [ok, msg] = game.addBot();
    res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });
    if (ok) broadcastState(game_id); // Broadcast when bot added
});

app.post('/rebuy', (req, res) => {
    const { game_id, user_id, amount } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    const p = game.players[user_id];
    if (!p) return res.json({ success: false });

    if (game.tournamentManager) {
        if (p.chips === 0) {
            const status = game.tournamentManager.handlePlayerBust(user_id, Object.keys(game.players).length);
            if (status === 'CAN_REENTRY') {
                const newChips = game.tournamentManager.executeReEntry(user_id);
                p.chips = newChips;
                p.sittingOut = false;
                game.messages.push(`${p.name} 執行了 Re-entry`);
                res.json({ success: true, game_state: game.toJSON(user_id) });
                broadcastState(game_id);
                return;
            } else {
                return res.json({ success: false, message: '無法 Re-entry (超出次數或已關閉)' });
            }
        } else {
            return res.json({ success: false, message: '籌碼歸零才能 Re-entry' });
        }
    }

    const a = parseInt(amount) || 1000;
    p.chips += a;
    p.sittingOut = false;
    game.messages.push(`${p.name} 買入了 ${a}`);
    res.json({ success: true, game_state: game.toJSON(user_id) });
    broadcastState(game_id);
});
    

app.post('/start_game', (req, res) => {
    const { game_id, user_id } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: '房號不存在' });
    if (game.playersOrder[0] !== user_id) return res.status(403).json({ success: false, message: "限房主開始" });
    const [ok, msg] = game.startGame();
    res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });
});

app.post('/game_action', (req, res) => {
    const { game_id, user_id, action, amount } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: "找不到遊戲" });
    if (action === 'next_round') {
        game.startNewRound();
        return res.json({ success: true, game_state: game.toJSON(user_id) });
    }
    const [ok, msg] = game.playerAction(user_id, action, amount);
    res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });
});

app.get('/get_game_state/:game_id/:user_id', (req, res) => {
    const { game_id, user_id } = req.params;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false });
    const player = game.players[user_id];
    if (player?.historyKey && player.historyKey !== req.get('X-History-Key')) return res.status(403).json({ success: false });
    game.advanceDueAction();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, game_state: game.toJSON(user_id) });
});

app.get('/hand_history/:user_id', (req, res) => {
    const key = req.get('X-History-Key');
    if (!key || key.length < 16) return res.status(403).json({ success: false });
    res.json({ success: true, hands: history.read(req.params.user_id + ':' + key) });
});
app.get('/practice_scenarios', (req, res) => res.json({ success: true, scenarios: practice.scenarios.map(({id,title,category,difficulty,prompt}) => ({id,title,category,difficulty,prompt})) }));
app.post('/practice_start', (req, res) => {
    const scene = practice.scenarios.find(s => s.id === req.body.scenario_id);
    if (!scene || !req.body.user_id) return res.status(400).json({ success: false, message: '無效練習場景' });
    const id = 'P' + require('crypto').randomBytes(5).toString('hex').toUpperCase();
    const game = new TexasHoldemGame(id, req.body.user_id, req.body.user_name || '練習玩家', 10000, 'cash', 50);
    game.players[req.body.user_id].historyKey = req.get('X-History-Key') || '';
    GAMES[id] = game; practice.setup(game, scene, Card, Deck);
    res.json({ success: true, game_id: id, game_state: game.toJSON(req.body.user_id) });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


io.on('connection', socket => {
    socket.on('join_room', ({ game_id, user_id, history_key }) => {
        const player = GAMES[game_id]?.players[user_id];
        if (!player || (player.historyKey && player.historyKey !== history_key)) return;
        socket.join(game_id);
        socket.join(user_id); // 【修復】讓每個玩家也加入以自己 ID 命名的房間，用來接收私人手牌
        socket.userId = user_id;
        socket.gameId = game_id;
        if (GAMES[game_id] && GAMES[game_id].players[user_id]) {
            const p = GAMES[game_id].players[user_id];
            // 如果遊戲進行中且玩家沒有手牌（中途加入），強制 sittingOut 等下一局
            if (GAMES[game_id].gameState !== 'waiting_for_players' && GAMES[game_id].gameState !== 'game_over' && p.waitingForNextRound) {
                p.sittingOut = true;
            } else {
                p.sittingOut = false; // Came back!
            }
            if(typeof GAMES[game_id].checkEmptyRoom === 'function') GAMES[game_id].checkEmptyRoom();
            broadcastState(game_id);
        }
    });
    socket.on('join_voice', () => {
        socket.to(socket.gameId).emit('voice_user_joined', socket.id);
    });
    socket.on('leave_voice', () => {
        socket.to(socket.gameId).emit('voice_user_left', socket.id);
    });
    socket.on('voice_signal', data => {
        socket.to(data.target).emit('voice_signal', { ...data, from: socket.id });
    });
    socket.on('disconnect', () => {
        if (socket.gameId && socket.userId && GAMES[socket.gameId]) {
            // Human turn deadlines still check/fold inactive players.
            // A disconnected socket alone does not mean the player left the page.
            broadcastState(socket.gameId);
        }
    });
});

const PORT = process.env.PORT || 5000;
if (!process.env.NO_SERVER) {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = { app, TexasHoldemGame, Card, Deck, GAMES, broadcastState, server, io };
