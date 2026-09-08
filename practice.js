const strategy = require('./poker-strategy');
const history = require('./hand-history');
const scenarios = [
 { id: 'btn-open', title: '按鈕位偷盲', category: '翻牌前', difficulty: '入門', street: 'pre_flop', hero: ['As','9s'], board: [], villain: ['Kd','Jh'], profile: 'rock', heroBet: 50, villainBet: 100, invested: 0, target: 100, lastRaise: 100, dealer: 'hero', stack: 9950, villainStack: 9900, prompt: '單挑盲注戰，BTN／SB 持 A9 同花，對手偏緊。你會如何開局？', lesson: '按鈕位有位置優勢，A9 同花適合主動加注；不要把所有可玩的牌都變成平跟。' },
 { id: 'three-bet', title: '面對 3-bet', category: '翻牌前', difficulty: '進階', street: 'pre_flop', hero: ['Ah','Qh'], board: [], villain: ['Ks','Kc'], profile: 'regular', heroBet: 300, villainBet: 1000, invested: 0, target: 1000, lastRaise: 700, dealer: 'hero', stack: 9700, villainStack: 9000, prompt: 'BTN 開到 3BB，BB 再加到 10BB。100BB 深度的 AQ 同花該如何繼續？', lesson: '面對常客的 3-bet，AQ 同花可在位置上跟注；4-bet 需考慮對手範圍，不能只看兩張大牌。' },
 { id: 'cbet', title: '乾燥牌面持續下注', category: '翻牌', difficulty: '入門', street: 'flop', hero: ['As','Kh'], board: ['Ad','7c','2s'], villain: ['7h','8h'], profile: 'recreational', heroBet: 0, villainBet: 0, invested: 300, target: 0, lastRaise: 100, dealer: 'hero', stack: 9700, villainStack: 9700, prompt: '你翻牌前加注，BB 跟注後在 A72 彩虹面過牌。頂對頂踢腳如何取值？', lesson: '乾燥 A 高面適合小額價值下注，讓較弱對子繼續。對愛跟注的玩家減少空氣詐唬。' },
 { id: 'draw', title: '轉牌聽花與底池賠率', category: '轉牌', difficulty: '入門', street: 'turn', hero: ['Ah','Jh'], board: ['Kh','7h','2c','9s'], villain: ['Kd','Qs'], profile: 'passive', heroBet: 0, villainBet: 1500, invested: 1500, target: 1500, lastRaise: 1500, dealer: 'hero', stack: 8500, villainStack: 7000, prompt: '底池原有 30BB，對手下注 15BB。你有堅果聽花，是否值得跟注？', lesson: '跟注門檻是 15/(30+15+15)=25%。純聽花通常不足；需要額外有效補牌或可信的隱含賠率。' },
 { id: 'river-catch', title: '河牌抓詐唬', category: '河牌', difficulty: '進階', street: 'river', hero: ['Qc','Js'], board: ['Qh','9h','4c','2d','7s'], villain: ['Ah','Th'], profile: 'loose', heroBet: 0, villainBet: 2000, invested: 2000, target: 2000, lastRaise: 2000, dealer: 'hero', stack: 8000, villainStack: 6000, prompt: '聽花未完成，鬆兇對手在 40BB 底池下注 20BB。頂對如何評估抓詐唬？', lesson: '需要 25% 勝率；辨認錯失聽牌與價值牌的比例。加注通常會讓空氣棄牌、強牌跟注。' },
 { id: 'short-stack', title: '15BB 短碼盲注戰', category: '短碼', difficulty: '進階', street: 'pre_flop', hero: ['8s','8h'], board: [], villain: ['Ad','Tc'], profile: 'regular', heroBet: 50, villainBet: 100, invested: 0, target: 100, lastRaise: 100, dealer: 'hero', stack: 1450, villainStack: 1400, prompt: '有效籌碼 15BB，單挑 BTN／SB 持 88。比較小加注與全下的優缺點。', lesson: '88 在短碼盲注戰有強度；全下可實現權益並施加棄牌壓力。錦標賽獎金壓力會改變範圍，本題未使用 ICM。' }
];
function setup(game, scene, Card, Deck) {
    const hero = game.players[game.playersOrder[0]];
    game.addBot();
    const villain = game.players[game.playersOrder[1]];
    villain.personality = strategy.personality(scene.profile);
    game.practice = scene;
    game.gameState = scene.street;
    game.activePlayersInRound = [hero.userId, villain.userId];
    game.blinds = { small: 50, big: 100 };
    game.dealerId = hero.userId; game.smallBlindId = hero.userId; game.bigBlindId = villain.userId; game.dealerPos = 0;
    game.currentPlayerIdx = 0; game.currentBetAmount = scene.target; game.lastRaiseAmount = scene.lastRaise;
    hero.hand = scene.hero.map(c => new Card(c[0], c[1]));
    villain.hand = scene.villain.map(c => new Card(c[0], c[1]));
    game.communityCards = scene.board.map(c => new Card(c[0], c[1]));
    hero.chips = scene.stack; villain.chips = scene.villainStack;
    hero.currentBet = scene.heroBet; villain.currentBet = scene.villainBet;
    hero.invested = scene.invested + scene.heroBet; villain.invested = scene.invested + scene.villainBet;
    villain.hasActed = scene.street !== 'pre_flop' || scene.target > 100;
    villain.actedAtBet = scene.target;
    game.pot = hero.invested + villain.invested;
    const used = new Set([...scene.hero, ...scene.villain, ...scene.board]);
    game.deck = new Deck(); game.deck.cards = game.deck.cards.filter(c => !used.has(c.toString()));
    history.begin(game); game.messages.push(scene.prompt); game.startTurnTimer();
}
module.exports = { scenarios, setup };
