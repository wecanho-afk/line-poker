const fs = require('fs');

let app_js = fs.readFileSync('app.js', 'utf-8');

app_js = app_js.replace(/    postBlind\(player, amount\) \{[\s\S]*?msg = `\$\{player.name\} 銝釣 \$\$\{bet\} \(\?脫釣\)`/g, `    postBlind(player, amount) {
        const bet = Math.min(amount, player.chips);
        player.chips -= bet;
        player.currentBet += bet;
        this.pot += bet;
        if (player.chips === 0) player.allIn = true;
        this.messages.push(\`\${player.name} 下注 $\${bet} (盲注)\`);
        player.hasActed = true;`);

// In makeBotDecision, handle all-in state so they don't bet when all-in
app_js = app_js.replace("if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) return;", "if (!['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState) || bot.allIn || bot.folded) return;");

// Update bot delay
app_js = app_js.replace(/2000 \+ Math\.random\(\) \* 1000/g, "3000");

// Update turn timer to 20 seconds total
app_js = app_js.replace(/this\.turnDeadline = Date\.now\(\) \+ 3000;/g, "this.turnDeadline = Date.now() + 3000;");

// In playerAction, we check if player.hasActed = true; but postBlind didn't set it to true.
// Fixed above.

fs.writeFileSync('app.js', app_js, 'utf-8');
console.log("Patch 3 applied.");
