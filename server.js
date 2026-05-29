const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Hand = require('pokersolver').Hand;

const app = express();
const io = new Server(server, {
    path: '/socket.io/', // 確保路徑與前端匹配
    cors: {
        origin: '*', // 允許所有來源連線，正式環境應限制為你的 Vercel 網址
        methods: ['GET', 'POST']
    }
});

app.use(express.static(path.join(__dirname, 'public')));

let players = []; 
let deck = [];
let communityCards = [];
let pot = 0;
let currentBet = 0;
let stage = 'waiting'; 
let activePlayerIndex = 0;
let dealerIndex = 0;
let defaultChips = 1000;
let botCount = 0;
let turnTimer = null;
let turnInterval = null;
let turnTimeLeft = 20;
let currentHandCount = 0;
let maxHands = 50;
let lastHandWinnerIds = []; // 新增：記錄上一手贏家ID，用於前端顯示"win"
let gameSessionScores = {}; // 新增：記錄50局遊戲的累計分數
const HAND_END_DELAY_MS = 5000; // 新增：每手結束後的延遲時間 (毫秒)

function handlePlayerAction(p, actionData) {
    clearTimeout(turnTimer);
    clearInterval(turnInterval);
    io.emit('timer_clear');

    p.hasActed = true;
    p.missedTurns = 0; // 重置閒置計數
    const action = actionData.action;

    if (action === 'fold') {
        p.folded = true;
        io.emit('play_sound', 'fold');
        io.emit('system_message', `${p.displayName} 蓋牌`);
    } else if (action === 'call') {
        let amountToCall = currentBet - p.bet;
        let actualCall = Math.min(amountToCall, p.chips);
        p.chips -= actualCall;
        p.bet += actualCall;
        if (actualCall === 0) {
            io.emit('play_sound', 'check');
            io.emit('system_message', `${p.displayName} 過牌 (Check)`);
        } else {
            io.emit('play_sound', 'call');
            io.emit('system_message', `${p.displayName} 跟注 (${actualCall})`);
        }
    } else if (action === 'raise') {
        let raiseAmount = actionData.amount || 20;
        let totalAmount = (currentBet - p.bet) + raiseAmount;
        let actualAmount = Math.min(totalAmount, p.chips);
        p.chips -= actualAmount;
        p.bet += actualAmount;
        currentBet = p.bet;
        players.forEach(other => {
            if (other.id !== p.id && !other.folded && other.chips > 0) {
                other.hasActed = false;
            }
        });
        io.emit('play_sound', 'raise');
        io.emit('system_message', `${p.displayName} 加注！ (${actualAmount})`);
    }
    
    broadcastState();
    nextTurn();
}

function startTurnTimer() {
    clearTimeout(turnTimer);
    clearInterval(turnInterval);
    
    if (stage === 'waiting' || stage === 'showdown') return;
    let p = players[activePlayerIndex];
    if (!p || p.isBot) return;

    turnTimeLeft = 20;
    io.emit('timer_update', { timeLeft: turnTimeLeft, playerId: p.id });

    turnInterval = setInterval(() => {
        turnTimeLeft--;
        io.emit('timer_update', { timeLeft: turnTimeLeft, playerId: p.id });
        if (turnTimeLeft <= 0) {
            clearInterval(turnInterval);
        }
    }, 1000);

    turnTimer = setTimeout(() => {
        if (players[activePlayerIndex] === p && !p.hasActed) {
            p.missedTurns = (p.missedTurns || 0) + 1;
            if (p.missedTurns >= 3) {
                io.emit('system_message', `${p.displayName} 閒置過久，自動踢除`);
                removePlayer(p.userId);
            } else {
                io.emit('system_message', `${p.displayName} 思考超時，自動蓋牌`);
                handlePlayerAction(p, { action: 'fold' });
            }
        }
    }, 20000);
}

function createDeck() {
    const suits = ['s', 'h', 'd', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    let newDeck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            let displaySuit = suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣';
            let displayRank = rank === 'T' ? '10' : rank;
            newDeck.push({ suit, rank, val: rank + suit, display: displayRank + displaySuit });
        }
    }
    return newDeck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function broadcastState() {
    io.emit('game_state', {
        players: players.map(p => ({
            id: p.id,
            displayName: p.displayName,
            pictureUrl: p.pictureUrl,
            chips: p.chips,
            bet: p.bet,
            folded: p.folded,
            rebuyCount: p.rebuyCount || 0,
            isActive: players.indexOf(p) === activePlayerIndex && stage !== 'waiting' && stage !== 'showdown',
            isDealer: players.indexOf(p) === dealerIndex,
            isBot: p.isBot,
            revealedHand: (stage === 'showdown' && !p.folded) ? p.hand : null
        })),
        communityCards,
        pot,
        currentBet,
        stage,
        defaultChips,
        currentHandCount,
        maxHands,
        lastHandWinnerIds // 新增：發送上一手贏家ID到前端
    });
}

function checkBotTurn() {
    if (stage === 'waiting' || stage === 'showdown') return;
    let p = players[activePlayerIndex];
    if (p && p.isBot && !p.folded && p.chips > 0) {
        setTimeout(() => {
            if (players[activePlayerIndex] !== p) return;
            
            let amountToCall = currentBet - p.bet;
            let action = 'call';
            
            // 更靈活的機器人決策邏輯
            if (amountToCall > 0) {
                let r = Math.random();
                if (amountToCall > p.chips * 0.5) {
                    // 面對大注，容易蓋牌
                    if (r < 0.6) action = 'fold';
                    else if (r < 0.9) action = 'call';
                    else action = 'raise';
                } else {
                    if (r < 0.15) action = 'fold';
                    else if (r < 0.75) action = 'call';
                    else action = 'raise';
                }
            } else {
                let r = Math.random();
                if (r < 0.7) action = 'call'; // Check
                else action = 'raise';
            }

            if (action === 'raise' && p.chips <= amountToCall + 20) {
                action = 'call';
            }

            p.hasActed = true;

            if (action === 'fold') {
                p.folded = true;
                io.emit('system_message', `${p.displayName} 蓋牌`);
                io.emit('play_sound', 'fold');
            } else if (action === 'call') {
                let actualCall = Math.min(amountToCall, p.chips);
                p.chips -= actualCall;
                p.bet += actualCall;
                if (actualCall === 0) {
                    io.emit('system_message', `${p.displayName} 過牌 (Check)`);
                    io.emit('play_sound', 'check');
                } else {
                    io.emit('system_message', `${p.displayName} 跟注 (${actualCall})`);
                    io.emit('play_sound', 'call');
                }
            } else if (action === 'raise') {
                // 亂數決定加注金額
                let possibleRaises = [20, 50, 100, Math.floor(pot / 2)];
                let raiseAmount = possibleRaises[Math.floor(Math.random() * possibleRaises.length)];
                let totalAmount = amountToCall + raiseAmount;
                let actualAmount = Math.min(totalAmount, p.chips);
                p.chips -= actualAmount;
                p.bet += actualAmount;
                currentBet = p.bet;
                players.forEach(other => {
                    if (other.id !== p.id && !other.folded && other.chips > 0) {
                        other.hasActed = false;
                    }
                });
                io.emit('system_message', `${p.displayName} 加注！ (${actualAmount})`);
                io.emit('play_sound', 'raise');
            }
            
            broadcastState();
            nextTurn();
        }, 1500 + Math.random() * 1500); // 加入隨機延遲，更像真人
    }
}

function nextTurn() {
    let nonFoldedPlayers = players.filter(p => !p.folded);
    if (nonFoldedPlayers.length <= 1) {
        endHand();
        return;
    }

    let allActed = true;
    for (let p of players) {
        if (!p.folded && p.chips > 0 && (p.bet !== currentBet || !p.hasActed)) {
            allActed = false;
            break;
        }
    }

    if (allActed) {
        nextStage();
    } else {
        do {
            activePlayerIndex = (activePlayerIndex + 1) % players.length;
        } while (players[activePlayerIndex].folded || players[activePlayerIndex].chips === 0);
        broadcastState();
        checkBotTurn();
        startTurnTimer();
    }
}

function nextStage() {
    players.forEach(p => {
        pot += p.bet;
        p.bet = 0;
        p.hasActed = false;
    });
    currentBet = 0;

    let playersWithChips = players.filter(p => !p.folded && p.chips > 0);

    if (stage === 'preflop') {
        stage = 'flop';
        communityCards.push(deck.pop(), deck.pop(), deck.pop());
    } else if (stage === 'flop') {
        stage = 'turn';
        communityCards.push(deck.pop());
    } else if (stage === 'turn') {
        stage = 'river';
        communityCards.push(deck.pop());
    } else if (stage === 'river') {
        stage = 'showdown';
        endHand();
        return;
    }

    if (playersWithChips.length <= 1) {
        // All in fast forward
        while (communityCards.length < 5) communityCards.push(deck.pop());
        endHand();
        return;
    }

    activePlayerIndex = dealerIndex;
    do {
        activePlayerIndex = (activePlayerIndex + 1) % players.length;
    } while (players[activePlayerIndex].folded || players[activePlayerIndex].chips === 0);

    broadcastState();
    checkBotTurn();
    startTurnTimer();
}

function endHand() {
    stage = 'showdown';
    let activePlayers = players.filter(p => !p.folded);
    
    players.forEach(p => { pot += p.bet; p.bet = 0; });
    currentBet = 0;

    if (activePlayers.length > 1) {
        while (communityCards.length < 5) communityCards.push(deck.pop());
    }

    let winnerMsg = "";
    let winnersList = [];
    if (activePlayers.length === 1) {
        let winner = activePlayers[0];
        winner.chips += pot;
        winnerMsg = `${winner.displayName} 贏得 ${pot} 籌碼 (其他人蓋牌)`;
        winnersList = [winner];
    } else {
        let boardCards = communityCards.map(c => c.val);
        let hands = [];
        activePlayers.forEach(p => {
            let pCards = p.hand.map(c => c.val);
            let solvedHand = Hand.solve(pCards.concat(boardCards));
            solvedHand.player = p;
            hands.push(solvedHand);
            io.emit('reveal_cards', { id: p.id, hand: p.hand });
        });
        
        let winners = Hand.winners(hands);
        let winAmount = Math.floor(pot / winners.length);
        
        let winnerNames = [];
        winners.forEach(w => {
            w.player.chips += winAmount;
            winnerNames.push(w.player.displayName);
            winnersList.push(w.player);
        });
        winnerMsg = `${winnerNames.join(', ')} 獲勝！牌型: ${winners[0].name}，贏得 ${winAmount}`;
    }

    io.emit('system_message', winnerMsg);
    
    // 新增：處理單局獲勝者的顯示
    lastHandWinnerIds = winnersList.map(w => w.id);

    // 新增：更新累計分數
    players.forEach(p => {
        if (!gameSessionScores[p.id]) {
            gameSessionScores[p.id] = 0;
        }
        // 計算單局籌碼變化，累加到會話總分
        let initialChips = defaultChips; 
        let playerHandScore = p.chips - initialChips; 
        gameSessionScores[p.id] += playerHandScore;
    });

    broadcastState(); // 在更新完 lastHandWinnerIds 和 gameSessionScores 後廣播狀態

    // 新增：在延遲後自動開始新一局或結束整個遊戲會話
    if (currentHandCount < maxHands) {
        setTimeout(() => startNewRoundFlow(), HAND_END_DELAY_MS);
    } else {
        // 達到最大局數，結束整個遊戲會話
        setTimeout(() => endGameSession(), HAND_END_DELAY_MS);
    }
}

function startHand() {
    players = players.filter(p => !p.kicked);
    if (players.length < 2) {
        stage = 'waiting';
        io.emit('system_message', '至少需要 2 名玩家(含電腦)才能開始');
        broadcastState();
        return;
    }

    currentHandCount++;
    if (currentHandCount > maxHands) {
        // This block should ideally not be reached if endGameSession is called after maxHands
        // but as a fallback, ensure the game session ends if for some reason it continues.
        io.emit('system_message', `遊戲結束！已達 ${maxHands} 局上限。`);
        stage = 'waiting';
        currentHandCount = 0;
        broadcastState();
        return;
    }

    deck = createDeck();
    shuffle(deck);
    communityCards = [];
    pot = 0;
    currentBet = 0;
    stage = 'preflop';

    players.forEach(p => {
        p.hand = [];
        p.bet = 0;
        p.folded = false;
        p.hasActed = false;
        if(p.chips <= 0) p.chips = defaultChips; // 如果籌碼歸零，重置為初始籌碼
    });
    lastHandWinnerIds = []; // 重置上一手贏家ID

    for (let i = 0; i < 2; i++) {
        players.forEach(p => p.hand.push(deck.pop()));
    }
    players.forEach(p => {
        if (!p.isBot) io.to(p.id).emit('receive_cards', p.hand);
    });

    let sbIndex = (dealerIndex + 1) % players.length;
    let bbIndex = (dealerIndex + 2) % players.length;
    
    let sbAmount = Math.min(10, players[sbIndex].chips);
    players[sbIndex].chips -= sbAmount;
    players[sbIndex].bet = sbAmount;

    let bbAmount = Math.min(20, players[bbIndex].chips);
    players[bbIndex].chips -= bbAmount;
    players[bbIndex].bet = bbAmount;

    currentBet = 20;

    activePlayerIndex = (dealerIndex + 3) % players.length;
    io.emit('system_message', '新牌局開始！輪到下注了');
    io.emit('clear_revealed');
    broadcastState();
    checkBotTurn();
    startTurnTimer();
}

function removePlayer(userId) {
    let idx = players.findIndex(p => p.userId === userId);
    if (idx !== -1) {
        let p = players[idx];
        io.emit('system_message', `${p.displayName} 已離開遊戲`);
        
        if (stage !== 'waiting' && stage !== 'showdown') {
            if (activePlayerIndex === idx && !p.hasActed) {
                handlePlayerAction(p, { action: 'fold' });
            }
            p.folded = true;
            p.chips = 0; 
            p.kicked = true; 
        } else {
            players.splice(idx, 1);
            if (activePlayerIndex >= idx) activePlayerIndex--;
        }
        broadcastState();
    }
}

// 新增：處理自動開始新一局的流程
function startNewRoundFlow() {
    // 新增：將發牌者輪到下一位
    dealerIndex = (dealerIndex + 1) % players.length;
    startHand();
}

// 新增：處理遊戲會話結束，顯示最終分數
function endGameSession() {
    io.emit('system_message', `遊戲會話結束！共 ${maxHands} 局。最終累計成績:`);
    // 廣播最終成績
    let finalScoresMsg = Object.keys(gameSessionScores)
        .map(playerId => {
            let player = players.find(p => p.id === playerId);
            return `${player ? player.displayName : '未知玩家'}: ${gameSessionScores[playerId]} 籌碼`;
        })
        .join(', ');
    io.emit('system_message', finalScoresMsg);

    // 重置所有遊戲會話相關的狀態
    stage = 'waiting';
    currentHandCount = 0;
    gameSessionScores = {}; 
    lastHandWinnerIds = []; // 重置贏家ID
    broadcastState();
}

io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        let p = players.find(player => player.id === socket.id);
        if (p && !p.isBot) {
            removePlayer(p.userId); // 離開網頁直接踢除
        }
    });

    socket.on('player_join', (data) => {
        let isGameRunning = (stage !== 'waiting' && stage !== 'showdown');
        if (!players.find(p => p.userId === data.userId)) {
            players.push({
                id: socket.id,
                userId: data.userId,
                displayName: data.displayName,
                pictureUrl: data.pictureUrl,
                chips: defaultChips,
                bet: 0,
                hand: [],
                folded: isGameRunning, // 遊戲進行中加入，預設為蓋牌狀態，等下一局
                hasActed: isGameRunning,
                isBot: false
            });
            if (isGameRunning) {
                io.emit('system_message', `${data.displayName} 進入牌桌，將於下一局加入`);
            }
        } else {
            let p = players.find(p => p.userId === data.userId);
            p.id = socket.id;
            io.to(p.id).emit('receive_cards', p.hand);
        }
        broadcastState();
    });

    socket.on('add_bot', () => {
        let isGameRunning = (stage !== 'waiting' && stage !== 'showdown');
        botCount++;
        players.push({
            id: 'bot_' + botCount + '_' + Date.now(),
            userId: 'bot_' + botCount,
            displayName: '🤖電腦 ' + botCount,
            pictureUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + botCount,
            chips: defaultChips,
            bet: 0,
            hand: [],
            folded: isGameRunning, // 遊戲進行中加入，預設為蓋牌狀態
            hasActed: isGameRunning,
            isBot: true
        });
        io.emit('system_message', `加入了電腦玩家${isGameRunning ? ' (下一局開始參與)' : ''}`);
        broadcastState();
    });

    socket.on('remove_bots', () => {
        players = players.filter(p => !p.isBot);
        botCount = 0;
        io.emit('system_message', `已移除所有電腦玩家`);
        broadcastState();
    });

    socket.on('set_chips', (amount) => {
        let parsed = parseInt(amount);
        if (parsed > 0) {
            defaultChips = parsed;
            players.forEach(p => p.chips = parsed);
            io.emit('system_message', `系統已將所有玩家籌碼重置為 ${parsed}`);
            broadcastState();
        }
    });

    socket.on('start_game', () => {
        if (stage === 'waiting' || stage === 'showdown') {
            // Removed dealerIndex update here, now handled by startNewRoundFlow for consistency.
            startHand();
        }
    });

    socket.on('action', (data) => {
        let p = players[activePlayerIndex];
        if (!p || p.id !== socket.id || p.isBot) return; 
        
        handlePlayerAction(p, data);
    });

    socket.on('rebuy', () => {
        let p = players.find(player => player.id === socket.id);
        if (p && p.chips <= 0) {
            p.chips = defaultChips;
            p.rebuyCount = (p.rebuyCount || 0) + 1;
            io.emit('system_message', `${p.displayName} 已補充籌碼`);
            broadcastState();
        }
    });
});

const PORT = process.env.PORT || 3000;
