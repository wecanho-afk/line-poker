const fs = require('fs');

let app_js = fs.readFileSync('app.js', 'utf-8');

app_js = app_js.replace(/        return \{\n            game_id: this\.gameId,[\s\S]*?const broadcastState = \(gameId\) => \{\n    if \(GAMES\[gameId\]\) io\.to\(gameId\)\.emit\('game_update', GAMES\[gameId\]\.toJSON\(null\)\);\n\};\n/, `        return {
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
                // 【修復】這裡的 userId 必須是呼叫這支 API 的那個人的 ID！
                // 否則如果發送給全部人，大家拿到的都是以「當前行動者」或「最後一位玩家」為視角的資料
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

const broadcastState = (gameId) => {
    const game = GAMES[gameId];
    if (game) {
        // 【修復】WebSocket 廣播時，必須針對每個人發送「屬於他自己視角」的狀態！
        game.playersOrder.forEach(pId => {
            io.to(pId).emit('game_update', game.toJSON(pId));
        });
        
        // 為了讓還沒加入座位（例如旁觀者）也能收到更新，發送一份遮蔽手牌的公版狀態到房間
        io.to(gameId).emit('game_update', game.toJSON(null));
    }
};
`);

app_js = app_js.replace("io.on('connection', socket => {\n    socket.on('join_room', ({ game_id, user_id }) => {\n        socket.join(game_id);\n        socket.userId = user_id;\n        socket.gameId = game_id;", "io.on('connection', socket => {\n    socket.on('join_room', ({ game_id, user_id }) => {\n        socket.join(game_id);\n        socket.join(user_id); // 【修復】讓每個玩家也加入以自己 ID 命名的房間，用來接收私人手牌\n        socket.userId = user_id;\n        socket.gameId = game_id;");

fs.writeFileSync('app.js', app_js, 'utf-8');
console.log("Patch 2 applied successfully.");
