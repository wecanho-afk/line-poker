const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const tmCode = `
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
`;

if (!code.includes('class TournamentManager')) {
    code = code.replace('class TexasHoldemGame {', tmCode + '\nclass TexasHoldemGame {');
}

if (!code.includes('this.gameMode = gameMode;')) {
    code = code.replace(
        'constructor(gameId, hostUserId, hostName, initialChips = 1000) {',
        'constructor(gameId, hostUserId, hostName, initialChips = 1000, gameMode = "cash") {'
    );
    code = code.replace(
        'this.initialChips = initialChips;',
        'this.gameMode = gameMode;\n        this.tournamentManager = gameMode === "tournament" ? new TournamentManager({ startingChips: initialChips, maxReEntry: 2, reEntryCutoffLevel: 6 }, null) : null;\n        this.initialChips = initialChips;'
    );
}

if (!code.includes('this.tournamentManager.initPlayer(userId)')) {
    code = code.replace(
        'this.players[userId] = player;',
        'this.players[userId] = player;\n        if (this.tournamentManager) this.tournamentManager.initPlayer(userId);'
    );
}

if (!code.includes('this.tournamentManager.startTournament();')) {
    const snr_search = `this.pot = 0;
        this.currentBetAmount = 0;
        this.winners = [];`;
    const snr_replace = `this.pot = 0;
        this.currentBetAmount = 0;
        this.winners = [];
        
        if (this.tournamentManager) {
            this.tournamentManager.startTournament();
            const upgraded = this.tournamentManager.checkAndUpgradeBlinds();
            const currentBlind = this.tournamentManager.getCurrentBlind();
            this.blinds = { small: currentBlind.smallBlind, big: currentBlind.bigBlind };
            if (upgraded) {
                this.messages.push(\`[錦標賽] 盲注升級至 \${this.blinds.small}/\${this.blinds.big}\`);
            }
        }`;
    code = code.replace(snr_search, snr_replace);
}

// Prepare next regex
if (!code.includes('const totalPlayers = Object.keys(this.players).length;')) {
    code = code.replace(/const busted = Object\.keys\(this\.players\).*?\}\);/s, `const busted = Object.keys(this.players).filter(id => this.players[id].chips === 0 && !this.players[id].sittingOut);
        busted.forEach(id => {
            if (this.tournamentManager) {
                const totalPlayers = Object.keys(this.players).length;
                const status = this.tournamentManager.handlePlayerBust(id, totalPlayers);
                if (status === 'CAN_REENTRY') {
                    if (this.players[id].isBot) {
                        this.players[id].chips = this.tournamentManager.executeReEntry(id);
                        this.messages.push(\`[錦標賽] \${this.players[id].name} 自動 Re-entry\`);
                    } else {
                        this.players[id].sittingOut = true;
                        this.messages.push(\`[錦標賽] \${this.players[id].name} 籌碼歸零，可選擇 Re-entry\`);
                    }
                } else {
                    this.players[id].sittingOut = true;
                    const rank = this.tournamentManager.playersStats[id].rank;
                    this.messages.push(\`[錦標賽] \${this.players[id].name} 遭到淘汰！名次：第 \${rank} 名\`);
                }
            } else {
                if (this.players[id].isBot) {
                    this.players[id].chips = this.initialChips;
                    this.messages.push(\`\${this.players[id].name} 已自動買入 $\${this.initialChips}\`);
                } else {
                    this.players[id].sittingOut = true;
                    this.messages.push(\`\${this.players[id].name} 籌碼歸零，請手動買入\`);
                }
            }
        });`);
}

// Update route
code = code.replace(
    'const { user_id, user_name, initial_chips, avatar } = req.body;',
    'const { user_id, user_name, initial_chips, avatar, game_mode } = req.body;'
);
code = code.replace(
    'GAMES[gameId] = new TexasHoldemGame(gameId, user_id, user_name, chips);',
    'GAMES[gameId] = new TexasHoldemGame(gameId, user_id, user_name, chips, game_mode || "cash");'
);

// Add rebuy support for tournaments
code = code.replace(
    /app\.post\('\/rebuy', \(req, res\) => \{.*?\}\);/s,
    `app.post('/rebuy', (req, res) => {
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
                game.messages.push(\`\${p.name} 執行了 Re-entry\`);
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
    game.messages.push(\`\${p.name} 買入了 $\${a}\`);
    res.json({ success: true, game_state: game.toJSON(user_id) });
    broadcastState(game_id);
});`
);

fs.writeFileSync('app.js', code, 'utf8');
console.log('Patched app.js successfully.');