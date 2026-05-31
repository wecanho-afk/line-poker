const fs = require('fs');
let code = fs.readFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', 'utf8');

const newLogic = `    addPlayer(userId, name, avatar = '') {
        if (this.playersOrder.length >= 6) return [false, "房間已滿"];
        if (this.players[userId]) return [false, "你已經在房間中"];

        const player = new Player(userId, name, this.initialChips);
        player.avatar = avatar;
        if (this.gameState !== 'waiting_for_players' && this.gameState !== 'game_over') {
            player.sittingOut = true; // Wait for next round
        }
        this.players[userId] = player;
        this.playersOrder.push(userId);
        this.messages.push(\`\${name} 加入了遊戲。\`);
        return [true, "成功加入"];
    }`;

code = code.replace(/    addPlayer\(userId, name, avatar = ''\) \{[\s\S]*?return \[true, ".*?"\];\n    \}/, newLogic);
fs.writeFileSync('C:/Users/wecan/.openclaw/workspace/line-poker/app.js', code);