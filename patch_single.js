const fs = require('fs');
let code = fs.readFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', 'utf8');

const newLogic = `    endRoundSingleWinner() {
        const winnerId = this.activePlayersInRound.find(id => !this.players[id].folded);
        const winner = this.players[winnerId];
        winner.chips += this.pot;
        this.winners = [winnerId];
        this.messages.push(\`\${winner.name} 獲勝，贏得 $\${this.pot} (其他玩家棄牌)\`);
        
        this.actionCount++;
        this.latestVoice = 'winner';
        this.gameState = 'showdown';
        
        broadcastState(this.gameId);
        setTimeout(() => { this.prepareNext(); broadcastState(this.gameId); }, 4000);
    }`;

code = code.replace(/    endRoundSingleWinner\(\) \{[\s\S]*?this\.prepareNext\(\);\n    \}/, newLogic);
fs.writeFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', code);
