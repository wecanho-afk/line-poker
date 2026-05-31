
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
