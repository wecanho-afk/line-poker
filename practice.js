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
// Heads-up decision drills. Amounts are street totals; invested is the equal
// contribution carried from previous streets. Each scenario uses a fresh deck.
function drill(id, title, street, hero, board, options) {
    const { villain, prompt, lesson, ...overrides } = options;
    const scene = { id, title, category: {pre_flop:'翻牌前',flop:'翻牌',turn:'轉牌',river:'河牌'}[street],
        difficulty:'進階', street, hero:hero.split(' '), board:board ? board.split(' ') : [], villain:villain.split(' '),
        profile:'regular', heroBet:0, villainBet:0, invested:500, target:0, lastRaise:100, dealer:'hero',
        prompt, lesson, ...overrides };
    const total = scene.total || 10000;
    scene.stack = total - scene.invested - scene.heroBet;
    scene.villainStack = total - scene.invested - scene.villainBet;
    return scene;
}
scenarios.push(
 drill('bb-defense','大盲防守小額開池','pre_flop','Ks Ts','', {villain:'Ah 5h',dealer:'villain',invested:0,heroBet:100,villainBet:250,target:250,lastRaise:150,
  prompt:'單挑 BTN 開到 2.5BB，你在 BB 持 KTs。考慮跟注、3-bet 與位置劣勢。',lesson:'小額開池給 BB 較好的賠率，KTs 有可玩性；可跟注，也可依開池範圍混合 3-bet。避免只因無位置就全部棄牌。'}),
 drill('four-bet-value','AA 面對 3-bet','pre_flop','Ac Ad','',{villain:'Ks Qs',invested:0,heroBet:300,villainBet:1100,target:1100,lastRaise:800,
  prompt:'100BB 深度，BTN 的 AA 開到 3BB，BB 3-bet 到 11BB。如何建立價值底池？',lesson:'AA 通常適合價值 4-bet。選擇能讓對手較弱牌繼續的尺寸；平跟可偶爾保護跟注範圍，但不能只怕把人嚇跑。'}),
 drill('limp-isolation','懲罰小盲平跟','pre_flop','Ad Jc','',{villain:'Qh 8h',profile:'recreational',dealer:'villain',invested:0,heroBet:100,villainBet:100,target:100,lastRaise:100,
  prompt:'單挑小盲平跟，你在 BB 持 AJo。免費看牌，還是加注取得價值？',lesson:'對休閒玩家的寬平跟範圍，AJo 適合加注取值；尺寸考慮對手跟注傾向，不必只做最小加注。'}),
 drill('ten-bb-push','10BB 按鈕位推進','pre_flop','As 5s','',{villain:'Kd Qc',category:'短碼',total:1000,invested:0,heroBet:50,villainBet:100,target:100,lastRaise:100,
  prompt:'有效籌碼 10BB，單挑 BTN／SB 持 A5 同花。如何衡量全下的棄牌率？',lesson:'短碼 A 同花具阻擋牌與被跟注後的勝率，可考慮直接全下。實際推進範圍取決於對手跟注與獎金壓力；本題無 ICM。'}),
 drill('call-short-shove','面對 12BB 全下','pre_flop','9s 9d','',{villain:'Ah Jc',dealer:'villain',category:'短碼',total:1200,invested:0,heroBet:100,villainBet:1200,target:1200,lastRaise:1100,
  prompt:'BTN／SB 全下 12BB，你在 BB 持 99，還需跟 11BB。對手已無籌碼，不能再加注。',lesson:'跟注需 11/(12+1+11)，約 45.8% 勝率。99 面對寬推進範圍通常有競爭力；不要把對手每次全下都當成大口袋對。'}),
 drill('deep-set-mine','200BB 小口袋對','pre_flop','5s 5d','',{villain:'Ah Kc',dealer:'villain',total:20000,invested:0,heroBet:100,villainBet:400,target:400,lastRaise:300,
  prompt:'有效籌碼 200BB，BTN 加到 4BB，BB 的 55 該怎麼繼續？',lesson:'深碼增加中暗三條後的潛在收益，但隱含賠率並非保證。考慮對手是否會付錢，以及沒中三條時是否能及時退出。'}),
 drill('check-raise-set','濕潤牌面暗三條','flop','8s 8d','Kh 8h 6c',{villain:'Ac Ks',dealer:'villain',heroBet:0,villainBet:700,target:700,lastRaise:700,
  prompt:'你在 BB 持 88，過牌後 BTN 在 K86 兩紅心面下注 7BB。如何規劃 check-raise？',lesson:'濕潤面暗三條可 check-raise 取值與收取聽牌費用。加注尺寸應為總額，並規劃轉牌剩餘籌碼。'}),
 drill('combo-draw','同花加兩頭順聽牌','flop','Jh Th','Qh 9h 2c',{villain:'Qd Ks',villainBet:700,target:700,lastRaise:700,profile:'loose',
  prompt:'J♥T♥ 在 Q♥9♥2♣ 面對 7BB 下注。強聽牌該跟注還是半詐唬加注？',lesson:'組合聽牌具實現勝率與棄牌率兩種收益，可考慮半詐唬。計算補牌時不要重複計算同花與順子的重疊張數。'}),
 drill('monotone-top-pair','單色面頂對','flop','Ac Kd','As 9s 4s',{villain:'Qs Jh',profile:'passive',
  prompt:'翻牌前加注者在 A♠9♠4♠ 拿到頂對，但手上沒有黑桃。對手已過牌。',lesson:'單色面降低一對牌的價值。可以過牌控池或小額下注；面對大幅反擊要重新評估，不能把頂對當成堅果牌。'}),
 drill('paired-board','成對牌面小額持續下注','flop','As Qd','7h 7c 2s',{villain:'Kd Jd',
  prompt:'BTN 持 AQ，BB 在 772 彩虹面過牌。沒有成對時是否仍有下注理由？',lesson:'成對乾燥面對手常未擊中，小額下注可利用範圍優勢。也能過牌保留 A 高攤牌價值；不需要每次持續下注。'}),
 drill('overpair-wet','超對面對濕潤牌面壓力','flop','Kc Kd','Jh Th 9s',{villain:'Qh 8h',dealer:'villain',villainBet:1000,target:1000,lastRaise:1000,
  prompt:'BB 持 KK，在 JT9 兩紅心面對 BTN 一個底池下注。超對是否足以打光？',lesson:'連接面會讓順子、兩對與強聽牌增加。KK 有強度但不是無條件全下，先評估對手下注範圍與後續不利牌。'}),
 drill('turn-scare-card','轉牌高張二次施壓','turn','Qc Jc','9s 7d 2h As',{villain:'8h 8d',profile:'rock',invested:1000,
  prompt:'你在翻牌下注被跟，轉牌落 A，BB 再過牌。QJ 空氣牌是否適合第二槍？',lesson:'A 可能有利於翻牌前加注者的範圍，但詐唬仍要有選擇。考慮對手能棄哪些一對牌，以及這手牌缺乏實質聽牌的代價。'}),
 drill('delayed-cbet','延遲持續下注','turn','Ah Qh','Ks 8d 3c Qs',{villain:'Jd 8c',profile:'recreational',invested:300,
  prompt:'翻牌双方過牌，轉牌 Q 讓你的 AQ 成為第二對，BB 再過牌。如何取薄價值？',lesson:'錯過翻牌下注不代表放棄整手牌。轉牌可從較弱對子取值，但不必用大尺寸把對手範圍逼得只剩更強牌。'}),
 drill('river-thin-value','河牌薄價值下注','river','Kh Qc','Kd 8s 3h 2c 9d',{villain:'Ks Jh',profile:'recreational',invested:1800,
  prompt:'對手一路跟注，河牌再過牌。KQ 頂對在安全牌面能否再取一街價值？',lesson:'先列出會跟注的較弱 K 與其他一對牌。對愛跟注的玩家可薄價值下注；尺寸應讓較弱牌願意付錢。'}),
 drill('river-overbet','頂對面對河牌超池下注','river','Ah Qc','Ad Js 6h 4c 2d',{villain:'Jd Jh',profile:'rock',invested:1500,villainBet:4500,target:4500,lastRaise:4500,
  prompt:'緊手對手在 30BB 底池下注 45BB，你拿 AQ 頂對。需要多少抓詐唬勝率？',lesson:'跟注門檻為 45/(30+45+45)=37.5%。緊手河牌大注常偏價值；不能只因自己有頂對便自動跟注。'}),
 drill('paired-river-flush','成對河牌上的同花','river','Ah Th','Kh 8h 3c 2h Kd',{villain:'8s 8d',invested:2000,villainBet:2500,target:2500,lastRaise:2500,
  prompt:'你在轉牌完成 A 高同花，河牌 K 讓公牌成對，對手主動大注。如何處理？',lesson:'A 高同花已不是堅果，對手可能完成葫蘆。區分仍會下注的較小同花、詐唬與葫蘆，避免只因手牌名稱強就加注。'}),
 drill('river-blocker','河牌堅果阻擋詐唬','river','As Qd','Ks Js 7c 4s 2h',{villain:'Kh Tc',profile:'regular',invested:2000,
  prompt:'你持 A♠ 但沒成花，對手在三黑桃牌面河牌過牌。是否把 A 高轉成詐唬？',lesson:'A♠ 阻擋堅果同花，但阻擋牌不是必須詐唬的命令。先考慮自己的下注線是否能代表強牌，以及對手是否會棄頂對。'}),
 drill('river-nuts','河牌堅果如何加注取值','river','As Ks','Qs Js Ts 4d 2c',{villain:'9s 8s',invested:1800,villainBet:1800,target:1800,lastRaise:1800,
  prompt:'你持皇家同花順，對手河牌下注半池。跟注、正常加注或全下，哪個尺寸能賺更多？',lesson:'堅果牌應思考對手可支付的範圍。強牌密集時可大加注，對手只有薄價值時則需平衡尺寸與跟注頻率；不要只慢打。'})
);
function setup(game, scene, Card, Deck) {
    const hero = game.players[game.playersOrder[0]];
    game.addBot();
    const villain = game.players[game.playersOrder[1]];
    villain.personality = strategy.personality(scene.profile);
    game.practice = scene;
    game.gameState = scene.street;
    game.activePlayersInRound = [hero.userId, villain.userId];
    game.blinds = { small: 50, big: 100 };
    game.dealerId = scene.dealer === 'villain' ? villain.userId : hero.userId;
    game.smallBlindId = game.dealerId;
    game.bigBlindId = scene.dealer === 'villain' ? hero.userId : villain.userId;
    game.dealerPos = game.playersOrder.indexOf(game.dealerId);
    game.currentPlayerIdx = 0; game.currentBetAmount = scene.target; game.lastRaiseAmount = scene.lastRaise;
    hero.hand = scene.hero.map(c => new Card(c[0], c[1]));
    villain.hand = scene.villain.map(c => new Card(c[0], c[1]));
    game.communityCards = scene.board.map(c => new Card(c[0], c[1]));
    hero.chips = scene.stack; villain.chips = scene.villainStack;
    hero.allIn = hero.chips === 0; villain.allIn = villain.chips === 0;
    hero.currentBet = scene.heroBet; villain.currentBet = scene.villainBet;
    hero.invested = scene.invested + scene.heroBet; villain.invested = scene.invested + scene.villainBet;
    villain.hasActed = scene.street !== 'pre_flop' || scene.target > 100 || scene.dealer === 'villain';
    villain.actedAtBet = scene.target;
    game.pot = hero.invested + villain.invested;
    const used = new Set([...scene.hero, ...scene.villain, ...scene.board]);
    game.deck = new Deck(); game.deck.cards = game.deck.cards.filter(c => !used.has(c.toString()));
    history.begin(game); game.messages.push(scene.prompt); game.startTurnTimer();
}
module.exports = { scenarios, setup };
