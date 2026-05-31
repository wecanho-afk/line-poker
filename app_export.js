const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const broadcastState = (gameId) => {
    if (GAMES[gameId]) io.to(gameId).emit('game_update', GAMES[gameId].toJSON(null));
};

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// --- Poker Logic ---

class Card {
    static SUITS = ['♠', '♥', '♦', '♣'];
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
        this.avatar = '';
    }
    resetForNewRound() {
        this.hand = [];
        this.currentBet = 0;
        this.folded = false;
        this.allIn = false;
        this.lastAction = null;
        this.hasActed = false;
    }
    canBet() { return !this.folded && !this.allIn && !this.sittingOut && this.chips > 0; }
}

class TexasHoldemGame {
    constructor(gameId, hostUserId, hostName, initialChips = 1000) {
        this.gameId = gameId;
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
        this.blinds = { small: 10, big: 20 };
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
        
        if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === userId) {
            const callAmount = this.currentBetAmount - p.currentBet;
            this.playerAction(userId, callAmount === 0 ? 'check' : 'fold');
        } else {
            const activeCount = this.playersOrder.filter(id => !this.players[id].sittingOut && this.players[id].chips > 0).length;
            if (activeCount < 2 && ['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) {
                this.endRoundSingleWinner();
            }
        }
    }

    addPlayer(userId, name, avatar = '') {
        if (this.gameState !== 'waiting_for_players') return [false, "遊戲已開始"];
        if (this.playersOrder.length >= 6) return [false, "牌桌已滿"];
        if (this.players[userId]) return [false, "你已在遊戲中"];

        const player = new Player(userId, name, this.initialChips);
        player.avatar = avatar;
        this.players[userId] = player;
        this.playersOrder.push(userId);
        this.messages.push(`${name} 加入了遊戲。`);
        return [true, "成功加入"];
    }

    addBot() {
        if (this.gameState !== 'waiting_for_players') return [false, "遊戲已開始"];
        if (this.playersOrder.length >= 6) return [false, "牌桌已滿"];
        const botId = 'bot_' + Math.random().toString(36).substr(2, 6);
        const botNames = ['Bot 艾麗絲', 'Bot 鮑伯', 'Bot 查理', 'Bot 戴夫', 'Bot 伊芙'];
        const botAvatars = ['🤖', '👽', '👻', '👾', '🎃'];
        const botName = botNames[this.playersOrder.length % botNames.length];
        const botAvatar = botAvatars[this.playersOrder.length % botAvatars.length];
        const [ok, msg] = this.addPlayer(botId, botName, botAvatar);
        if (ok) this.players[botId].isBot = true;
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
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.currentBetAmount = 0;
        this.winners = [];
        
        Object.values(this.players).forEach(p => {
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

        // Post Blinds
        this.postBlind(this.players[this.smallBlindId], this.blinds.small);
        this.postBlind(this.players[this.bigBlindId], this.blinds.big);
        this.currentBetAmount = this.blinds.big;
        this.lastRaiseAmount = this.blinds.big; // 翻牌前的最低加注增量是一次大盲

        this.messages.push(`莊家: ${this.players[this.dealerId].name}`);

        // Pre-flop: Action starts left of BB (UTG)
        this.currentPlayerIdx = this.activePlayersInRound.indexOf(this.bigBlindId);
        this.moveToNextPlayer();

        this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
        this.startTurnTimer();
    }

    postBlind(player, amount) {
        const bet = Math.min(amount, player.chips);
        player.chips -= bet;
        player.currentBet += bet;
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
        const winnerId = this.activePlayersInRound.find(id => !this.players[id].folded);
        const winner = this.players[winnerId];
        winner.chips += this.pot;
        this.winners = [winnerId];
        this.messages.push(`${winner.name} 獲勝！贏得 $${this.pot} (其他玩家皆蓋牌)`);
        
        this.actionCount++;
        this.latestVoice = 'winner';
        this.prepareNext();
    }

    endBettingRound() {
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
             setTimeout(() => { this.endBettingRound(); }, 1500);
             return;
        }

        if (this.moveToNextPlayer()) {
            this.messages.push(`現在輪到 ${this.getCurrentPlayer().name} 行動。`);
            this.startTurnTimer();
        }
    }

    playerAction(userId, action, amount = 0) {
        if (userId !== this.getCurrentPlayer().userId) return [false, "不輪到你"];
        const player = this.players[userId];
        let success = false;
        let msg = "";

        player.hasActed = true;

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
            this.pot += totalToPutIn;
            this.currentBetAmount = amount;
            if (player.chips === 0) player.allIn = true;
            msg = `${player.name} 加注至 $${amount}`;
            success = true;

            // Everyone else needs to act again to match the new bet
            this.activePlayersInRound.forEach(id => {
                if (id !== userId) this.players[id].hasActed = false;
            });
        }

        if (success) {
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


    startTurnTimer() {
        if (this.turnTimeout) { clearTimeout(this.turnTimeout); this.turnTimeout = null; }
        if (['waiting_for_players', 'game_over', 'showdown', 'waiting_for_next_round'].includes(this.gameState)) {
            this.turnDeadline = 0;
            return;
        }
        
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) return;

        if (currentPlayer.isBot) {
            this.turnDeadline = Date.now() + 3000;
            this.turnTimeout = setTimeout(() => {
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === currentPlayer.userId) {
                    this.makeBotDecision(currentPlayer);
                }
            }, 3000);
        } else {
            this.turnDeadline = Date.now() + 20000; // 20 seconds
            this.turnTimeout = setTimeout(() => {
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === currentPlayer.userId) {
                    const callAmount = this.currentBetAmount - currentPlayer.currentBet;
                    this.playerAction(currentPlayer.userId, callAmount === 0 ? 'check' : 'fold');
                }
            }, 20000);
        }
        broadcastState(this.gameId);
    }


    makeBotDecision(bot) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState) || bot.allIn || bot.folded) return;
        const callAmount = this.currentBetAmount - bot.currentBet;
        const minRaise = this.currentBetAmount + this.lastRaiseAmount;
        let action = 'fold';
        let amount = 0;
        const rand = Math.random();

        if (callAmount === 0) {
            if (rand < 0.8) action = 'check';
            else { action = 'raise'; amount = minRaise; }
        } else {
            if (rand < 0.2) action = 'fold';
            else if (rand < 0.8) action = 'call';
            else { action = 'raise'; amount = minRaise; }
            
            if (action === 'raise' && bot.chips < (amount - bot.currentBet)) {
                action = 'call';
            }
        }
        this.playerAction(bot.userId, action, amount);
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
        const eligible = Object.values(this.players).filter(p => !p.folded && !p.sittingOut);
        const scored = eligible.map(p => {
            const evalResult = this.evaluateHand([...p.hand, ...this.communityCards]);
            return { p, score: evalResult.score, desc: evalResult.desc };
        });

        scored.sort((a, b) => b.score - a.score);
        const winningScore = scored[0].score;
        const winners = scored.filter(s => s.score === winningScore);
        
        const share = Math.floor(this.pot / winners.length);
        this.winners = winners.map(w => w.p.userId);

        winners.forEach(w => w.p.chips += share);
        
        const winnerNamesDesc = winners.map(w => `${w.p.name} (${w.desc})`).join(', ');
        this.messages.push(`開牌！勝者: ${winnerNamesDesc} 贏得 $${this.pot}`);
        
        this.gameState = 'showdown';
        this.actionCount++;
        this.latestVoice = 'winner';
        
        setTimeout(() => { this.prepareNext(); }, 6000);
    }

    prepareNext() {
        const busted = Object.keys(this.players).filter(id => this.players[id].chips === 0 && !this.players[id].sittingOut);
        busted.forEach(id => {
            if (this.players[id].isBot) {
                this.players[id].chips = this.initialChips;
                this.messages.push(`${this.players[id].name} 自動重新買入了 $${this.initialChips}`);
            } else {
                this.players[id].sittingOut = true;
                this.messages.push(`${this.players[id].name} 籌碼歸零，等待重新買入`);
            }
        });

        const activePlayers = this.playersOrder.filter(id => !this.players[id].sittingOut);
        
        if (activePlayers.length < 2) {
            this.gameState = 'game_over';
            this.messages.push("活躍玩家不足，等待玩家買入。");
        } else {
            this.gameState = 'waiting_for_next_round';
        }
    }

    toJSON(userId) {
        return {
            viewer_id: userId,
            game_id: this.gameId,
            game_state: this.gameState,
            pot: this.pot,
            current_bet_amount: this.currentBetAmount,
            turn_deadline: this.turnDeadline,
            min_raise: this.currentBetAmount + this.lastRaiseAmount,
            community_cards: this.communityCards.map(c => c.toString()),
            current_player_id: this.getCurrentPlayer() ? this.getCurrentPlayer().userId : null,
            winners: this.winners,
            action_count: this.actionCount || 0,
            latest_voice: this.latestVoice || '',
            last_messages: this.messages.slice(-5),
            dealer_id: this.dealerId,
            sb_id: this.smallBlindId,
            bb_id: this.bigBlindId,
            players: this.playersOrder.map(id => {
                const p = this.players[id];
                const showCards = p.userId === userId || this.gameState === 'showdown';
                return {
                    user_id: p.userId,
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
    const { user_id, user_name, initial_chips, avatar } = req.body;
    const chips = parseInt(initial_chips) || 1000;
    const gameId = Math.random().toString(36).substr(2, 8).toUpperCase();
    GAMES[gameId] = new TexasHoldemGame(gameId, user_id, user_name, chips);
    if (avatar) GAMES[gameId].players[user_id].avatar = avatar;
    res.json({ success: true, game_id: gameId, game_state: GAMES[gameId].toJSON(user_id) });
    broadcastState(gameId);
});

app.post('/join_game', (req, res) => {
    const { game_id, user_id, user_name, avatar } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: "房號不存在" });
    const [ok, msg] = game.addPlayer(user_id, user_name, avatar);
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
});

app.post('/rebuy', (req, res) => {
    const { game_id, user_id, amount } = req.body;
    const game = GAMES[game_id];
    if (!game) return res.status(404).json({ success: false, message: "房號不存在" });
    const player = game.players[user_id];
    if (!player) return res.status(404).json({ success: false, message: "玩家不在遊戲中" });
    
    const buyIn = parseInt(amount) || game.initialChips;
    player.chips += buyIn;
    player.sittingOut = false;
    game.messages.push(`${player.name} 重新買入了 $${buyIn}`);
    
    if (game.gameState === 'game_over') {
        const activePlayers = game.playersOrder.filter(id => !game.players[id].sittingOut);
        if (activePlayers.length >= 2) {
            game.gameState = 'waiting_for_next_round';
        }
    }
    
    res.json({ success: true, game_state: game.toJSON(user_id) });
    broadcastState(game_id);
});

app.post('/start_game', (req, res) => {
    const { game_id, user_id } = req.body;
    const game = GAMES[game_id];
    if (game.playersOrder[0] !== user_id) return res.status(403).json({ success: false, message: "限房主開始" });
    const [ok, msg] = game.startGame();
    res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });
});

app.post('/game_action', (req, res) => {
    const { game_id, user_id, action, amount } = req.body;
    const game = GAMES[game_id];
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
    res.json({ success: true, game_state: game.toJSON(user_id) });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


io.on('connection', socket => {
    socket.on('join_room', ({ game_id, user_id }) => {
        socket.join(game_id);
        socket.join(user_id); // 【修復】讓每個玩家也加入以自己 ID 命名的房間，用來接收私人手牌
        socket.userId = user_id;
        socket.gameId = game_id;
        if (GAMES[game_id] && GAMES[game_id].players[user_id]) {
            GAMES[game_id].players[user_id].sittingOut = false; // Came back!
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
            GAMES[socket.gameId].handleDisconnect(socket.userId);
            broadcastState(socket.gameId);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = { PokerGame, Player, Card, Deck, GAMES };