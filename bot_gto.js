// Helper class to evaluate hand strength for the bot and decide actions
class PokerBotGTO {
    // Generate a random personality profile for the bot
    static generatePersonality() {
        return {
            aggression: 0.5 + Math.random() * 1.0, // 0.5 (passive) to 1.5 (hyper-aggressive)
            tightness: 0.5 + Math.random() * 1.0,  // 0.5 (loose) to 1.5 (tight)
            bluffFreq: 0.5 + Math.random() * 1.0   // 0.5 (honest) to 1.5 (bluffer)
        };
    }

    static getHandStrength(hand, communityCards) {
        if (!hand || hand.length !== 2) return 0;
        const val = (r) => {
            const map = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
            return map[r] || 0;
        };
        const r1 = val(hand[0].rank);
        const r2 = val(hand[1].rank);
        const suited = hand[0].suit === hand[1].suit;
        const high = Math.max(r1, r2);
        const low = Math.min(r1, r2);
        
        let score = 0;
        // Preflop basic strength (1-100 scale roughly)
        if (high === low) {
            score = 50 + (high * 3); // Pocket pairs: 22(56) - AA(92)
        } else {
            score = (high * 2.5) + (low * 1.5);
            if (suited) score += 10;
            if (high - low === 1) score += 5; // Connected
            else if (high - low === 2) score += 2; // One gapper
        }
        return score; // Range ~10 to 95
    }

    static decide(game, bot) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(game.gameState) || bot.allIn || bot.folded) return {action: 'fold', amount: 0};
        
        // Ensure bot has a personality
        if (!bot.personality) {
            bot.personality = this.generatePersonality();
        }
        const { aggression, tightness, bluffFreq } = bot.personality;

        const callAmount = game.currentBetAmount - bot.currentBet;
        const minRaise = game.currentBetAmount + game.lastRaiseAmount;
        const pot = game.pot;
        const activePlayers = game.activePlayersInRound.filter(id => !game.players[id].folded && !game.players[id].allIn);
        const numActive = activePlayers.length;
        
        // Find bot position
        const pIdx = game.activePlayersInRound.indexOf(bot.userId);
        const isLatePosition = pIdx >= game.activePlayersInRound.length - 2;
        const isEarlyPosition = pIdx <= 1 && game.activePlayersInRound.length > 3;

        // SPR (Stack-to-Pot Ratio)
        const effectiveStack = bot.chips;
        const spr = pot > 0 ? effectiveStack / pot : 10;

        let action = 'fold';
        let amount = 0;
        let bluffProb = 0;
        const rand = Math.random();

        const handScore = this.getHandStrength(bot.hand, game.communityCards);
        
        // Adjust hand score threshold based on tightness (higher tightness = requires higher score)
        const effectiveScore = handScore / tightness;

        // Stage logic
        if (game.gameState === 'pre_flop') {
            if (effectiveScore > 80) { // Premium
                action = 'raise';
                amount = Math.max(minRaise, pot * (0.6 + rand * 0.4 * aggression) + callAmount);
            } else if (effectiveScore > 65) { // Strong
                if (callAmount === 0 || callAmount <= game.smallBlind * 4) {
                    action = (rand * aggression > 0.4) ? 'raise' : 'call';
                    amount = minRaise;
                } else {
                    action = 'call';
                }
            } else if (effectiveScore > 50) { // Playable
                if (callAmount === 0 || callAmount <= game.smallBlind * 2) {
                    action = 'call';
                } else if (isLatePosition && callAmount === 0) {
                    action = (rand * aggression > 0.5) ? 'raise' : 'call'; // Steal
                    amount = minRaise;
                } else {
                    action = 'fold';
                }
            } else { // Weak
                action = (callAmount === 0) ? 'check' : 'fold';
                // Occasional bluff steal from late position if folded to us
                if (isLatePosition && callAmount === 0 && numActive <= 3 && (rand * bluffFreq > 0.75)) {
                    action = 'raise';
                    amount = minRaise;
                }
            }
        } else {
            // Post-flop (simplified GTO heuristic since we can't run full solver)
            // Just simulate hit strength. In reality, we'd need a hand evaluator for postflop.
            // We will use a randomized strength based on preflop + community cards count to simulate hit/miss.
            
            // Very basic postflop pseudo-strength (0-100)
            // If we had the real evaluateHand result, we'd use it, but evaluateHand takes 5+ cards.
            const allCards = [...(bot.hand || []), ...(game.communityCards || [])];
            let currentStr = handScore * 0.4; // Base retention
            let hasHit = false;
            let drawStrength = 0;

            if (allCards.length >= 5) {
                const evalObj = game.evaluateHand(allCards);
                // score is large, normalize it roughly: Pair=10M, TwoPair=20M, etc.
                if (evalObj.score > 20000000) currentStr = 85; // Two pair+
                else if (evalObj.score > 10000000) currentStr = 60; // Pair
                else currentStr = 20; // High card
            }
            
            // Adjust current strength based on personality (aggression increases perceived strength)
            currentStr = currentStr * (1 + (aggression - 1) * 0.2);

            // Aggression logic
            if (currentStr > 80) { // Value
                action = 'raise';
                let betSize = pot * (rand < 0.5 ? 0.5 : 1.0) * aggression; 
                amount = Math.max(minRaise, Math.floor(betSize) + callAmount);
            } else if (currentStr > 50) { // Marginal
                if (callAmount === 0) {
                    action = (rand * aggression > 0.6) ? 'raise' : 'check';
                    amount = minRaise;
                } else {
                    if (callAmount > pot * 0.5 && rand > 0.5 * tightness) action = 'fold';
                    else action = 'call';
                }
            } else { // Air / Weak
                if (callAmount === 0) {
                    // Bluff frequency based on position and active players
                    bluffProb = (isLatePosition && numActive <= 2 ? 0.3 : 0.1) * bluffFreq;
                    if (rand < bluffProb) {
                        action = 'raise';
                        amount = Math.max(minRaise, Math.floor(pot * 0.5 * aggression)); // Half pot bluff
                    } else {
                        action = 'check';
                    }
                } else {
                    if (callAmount <= pot * 0.2 && rand > 0.5) action = 'call'; // Float
                    else action = 'fold';
                }
            }
        }

        // Fix amount caps
        if (action === 'raise' && bot.chips < (amount - bot.currentBet)) {
            if (bot.chips + bot.currentBet > callAmount) {
                action = 'raise'; // All-in essentially
                amount = bot.chips + bot.currentBet;
            } else {
                action = 'call';
            }
        }
        
        // 四捨五入下注金額至整數位
        if (amount > 0) amount = Math.round(amount);
        
        // Standardize check/fold if call=0
        if (action === 'fold' && callAmount === 0) action = 'check';
        if (action === 'call' && callAmount === 0) action = 'check';

        return { action, amount };
    }
}
module.exports = PokerBotGTO;
