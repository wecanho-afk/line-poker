const fs = require('fs');
let code = fs.readFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', 'utf8');
const newLogic = `    determineWinner() {
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
            potWinners.forEach(w => {
                winnings.set(w, (winnings.get(w) || 0) + share);
                if (!winnersList.includes(w)) winnersList.push(w);
            });
        }

        this.winners = winnersList.map(w => w.userId);
        const winnerMessages = [];
        for (const [w, amount] of winnings.entries()) {
            w.chips += amount;
            const desc = playerScores.get(w).desc;
            winnerMessages.push(\`\${w.name} (\${desc}) 贏得 $\${amount}\`);
        }
        this.messages.push(\`結算: \${winnerMessages.join(', ')}\`);

        this.gameState = 'showdown';
        this.actionCount++;
        this.latestVoice = 'winner';
        
        broadcastState(this.gameId);
        setTimeout(() => { this.prepareNext(); broadcastState(this.gameId); }, 6000);
    }`;

code = code.replace(/    determineWinner\(\) \{[\s\S]*?broadcastState\(this\.gameId\);\ \}, 6000\);\n    \}/, newLogic);
fs.writeFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', code);