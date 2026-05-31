const { readFileSync } = require('fs');
const code = readFileSync('app.js', 'utf8');

const regex = /class PokerGame \{[\s\S]*\}\n\nconst GAMES/;
const match = code.match(regex);
let pokerGameCode = match ? match[0].replace('const GAMES', '') : '';

pokerGameCode += `
const game = new PokerGame('g1', 'u1', 'TestUser');
game.addBot(); // 1
game.addBot(); // 2
game.addBot(); // 3
game.addBot(); // 4
game.addBot(); // 5
game.startGame();

setTimeout(() => {
    console.log("Current player: ", game.getCurrentPlayer()?.name);
    console.log("Game state:", game.gameState);
}, 4000);
`;

const fs = require('fs');
fs.writeFileSync('test_game.js', pokerGameCode);
