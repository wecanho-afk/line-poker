// Helper class to evaluate hand strength for the bot and decide actions
class PokerBotGTO {
    // Generate a random personality profile for the bot
    static generatePersonality() {
        return {
            strongThreshold: 0.65 + (Math.random() - 0.5) * 0.1,
            midThreshold: 0.40 + (Math.random() - 0.5) * 0.1,
            drawBluffProb: 0.40 + (Math.random() - 0.5) * 0.2,
            airBluffProb: 0.10 + (Math.random() - 0.5) * 0.05,
            epsilon: 0.10 + (Math.random() - 0.5) * 0.05
        };
    }

    // 粗略估計勝率與聽牌 (簡化版 - 產生 0.0 ~ 1.0 的 Equity 與是否為強聽牌)
    static estimateHand(bot, game) {
        let equity = 0.3; // 預設空氣
        let isStrongDraw = false;
        
        const allCards = [...(bot.hand || []), ...(game.communityCards || [])];
        
        if (game.gameState === 'pre_flop') {
            const val = (r) => {
                const map = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
                return map[r] || 0;
            };
            const r1 = val(bot.hand[0].rank);
            const r2 = val(bot.hand[1].rank);
            const suited = bot.hand[0].suit === bot.hand[1].suit;
            const high = Math.max(r1, r2);
            const low = Math.min(r1, r2);
            
            // 將起手牌轉換為 0.0 ~ 1.0 的勝率估計
            let score = 0;
            if (high === low) score = 50 + (high * 3);
            else {
                score = (high * 2.5) + (low * 1.5);
                if (suited) score += 10;
                if (high - low === 1) score += 5;
                else if (high - low === 2) score += 2;
            }
            equity = score / 100.0;
            isStrongDraw = suited || (high - low <= 2);
        } else {
            if (allCards.length >= 5) {
                const evalObj = game.evaluateHand(allCards);
                // 根據 evaluateHand 粗略轉換
                if (evalObj.score > 20000000) equity = 0.85; // Two pair+
                else if (evalObj.score > 10000000) equity = 0.60; // Pair
                else equity = 0.20; // High card
            }
            // 聽牌判斷
            const suits = {};
            allCards.forEach(c => { suits[c.suit] = (suits[c.suit] || 0) + 1; });
            const maxSuit = Math.max(...Object.values(suits));
            if (maxSuit === 4) isStrongDraw = true; // 四張同花聽牌
        }
        
        // 限制在 0.0 - 1.0 之間
        equity = Math.max(0, Math.min(1, equity));
        return { equity, isStrongDraw };
    }

    static decide(game, bot) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(game.gameState) || bot.allIn || bot.folded) return {action: 'fold', amount: 0};
        
        if (!bot.personality) {
            bot.personality = Object.assign(this.generatePersonality(), bot.personality || {});
        }

        const potSize = game.pot;
        const callAmount = game.currentBetAmount - bot.currentBet;
        const minRaise = game.currentBetAmount + game.lastRaiseAmount;
        
        const epsilon = bot.personality.epsilon !== undefined ? bot.personality.epsilon : 0.1;
        const strongThresh = bot.personality.strongThreshold !== undefined ? bot.personality.strongThreshold : 0.65;
        const midThresh = bot.personality.midThreshold !== undefined ? bot.personality.midThreshold : 0.40;
        const drawBluff = bot.personality.drawBluffProb !== undefined ? bot.personality.drawBluffProb : 0.40;
        const airBluff = bot.personality.airBluffProb !== undefined ? bot.personality.airBluffProb : 0.10;
        
        const { equity, isStrongDraw } = this.estimateHand(bot, game);

        let actionObj = { action: 'fold', amount: 0 };
        const rand = Math.random();

        // 離散化動作的輔助函數
        const actionFold = () => ({ action: callAmount > 0 ? 'fold' : 'check', amount: 0 });
        const actionCheckCall = () => ({ action: callAmount > 0 ? 'call' : 'check', amount: 0 });
        const actionBet33 = () => ({ action: 'raise', amount: Math.max(minRaise, Math.floor(potSize * 0.33) + callAmount) });
        const actionBet75 = () => ({ action: 'raise', amount: Math.max(minRaise, Math.floor(potSize * 0.75) + callAmount) });
        const actionAllIn = () => ({ action: 'raise', amount: bot.chips + bot.currentBet });

        // 探索率 (Epsilon-Greedy)
        if (Math.random() < epsilon) {
            const actions = [actionFold, actionCheckCall, actionBet33, actionBet75, actionAllIn];
            const randomChoice = actions[Math.floor(Math.random() * actions.length)];
            actionObj = randomChoice();
        } else {
            // 決策邏輯
            if (equity > strongThresh) {
                // 強成牌：傾向於 BET_75 或 ALL_IN
                actionObj = (rand < 0.7) ? actionBet75() : actionAllIn();
            } else if (equity >= midThresh && equity <= strongThresh) {
                // 中等成牌：傾向於 CHECK/CALL
                actionObj = actionCheckCall();
            } else if (isStrongDraw) {
                // 強聽牌：有一定比例進行半詐唬，其餘跟注
                if (rand < drawBluff) {
                    actionObj = (Math.random() < 0.5) ? actionBet75() : actionBet33();
                } else {
                    actionObj = actionCheckCall();
                }
            } else {
                // 空氣牌：高機率 FOLD，保留一定純詐唬機率
                if (rand < airBluff) {
                    actionObj = actionBet33();
                } else {
                    actionObj = actionFold();
                }
            }
        }

        // 確保加註金額不會超過玩家籌碼
        if (actionObj.action === 'raise' && bot.chips < (actionObj.amount - bot.currentBet)) {
            if (bot.chips + bot.currentBet > callAmount) {
                actionObj.action = 'raise'; // All-in essentially
                actionObj.amount = bot.chips + bot.currentBet;
            } else {
                actionObj.action = 'call';
                actionObj.amount = 0;
            }
        }

        // 修正四捨五入
        if (actionObj.amount > 0) actionObj.amount = Math.round(actionObj.amount);

        return actionObj;
    }
}
module.exports = PokerBotGTO;