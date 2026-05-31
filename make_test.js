const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');
code = code.replace(/const app = express\(\);[\s\S]*?app\.use\(express\.static\('\.'\)\);/, '');
code = code.replace(/app\.post\([\s\S]*/, '');
code += `
function broadcastState() {}
const game = new TexasHoldemGame('g1', 'u1', 'Will', 1000);
game.addPlayer('u2', 'P2');
game.addPlayer('u3', 'P3');
game.startGame();

let current = game.getCurrentPlayer().userId;
game.playerAction(current, 'raise', 1000);
current = game.getCurrentPlayer().userId;
game.playerAction(current, 'call');
current = game.getCurrentPlayer().userId;
game.playerAction(current, 'call');

setTimeout(() => {
    console.log(game.gameState);
    console.log(game.messages);
    process.exit(0);
}, 8000);
`;
fs.writeFileSync('test_run.js', code);