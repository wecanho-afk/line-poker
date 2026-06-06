class PokerBotGTO {
    // Generate personality profile
    static generatePersonality() {
        return {
            epsilon: 0.10, // Starts at 10%, will decay to prevent crazy random moves later
            handsPlayed: 0,
            opponentProfile: {}, 
            tightness: 1.0,
            aggression: 1.0
        };
    }

    // Estimate hand strength (0.0 to 1.0)
    static estimateHand(bot, game) {
        let equity = 0.3;
        let isStrongDraw = false;
        
        const allCards = [...(bot.hand || []), ...(game.communityCards || [])];
        
        if (game.gameState === 'pre_flop') {
            const val = (r) => {
                const map = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
                return map[r] || 0;
            };
            const r1 = bot.hand[0] ? val(bot.hand[0].rank) : 0;
            const r2 = bot.hand[1] ? val(bot.hand[1].rank) : 0;
            const suited = bot.hand[0] && bot.hand[1] && bot.hand[0].suit === bot.hand[1].suit;
            const high = Math.max(r1, r2);
            const low = Math.min(r1, r2);
            
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
                // Based on standard hand eval score
                if (evalObj.score > 20000000) equity = 0.85; // Two pair+
                else if (evalObj.score > 10000000) equity = 0.60; // Pair
                else equity = 0.20; // High card
            }
            // Check for flush draw
            const suits = {};
            allCards.forEach(c => { suits[c.suit] = (suits[c.suit] || 0) + 1; });
            const maxSuit = Math.max(...Object.values(suits), 0);
            if (maxSuit >= 4) isStrongDraw = true; // 4 to a flush
        }
        
        equity = Math.max(0, Math.min(1, equity));
        return { equity, isStrongDraw };
    }

    // Calculate Pot Odds
    static calculatePotOdds(potSize, callAmount) {
        if (callAmount <= 0) return 0.0;
        return callAmount / (potSize + callAmount);
    }

    // Core decision engine
    static decide(game, bot) {
        if (!['pre_flop', 'flop', 'turn', 'river'].includes(game.gameState) || bot.allIn || bot.folded) {
            return { action: 'fold', amount: 0 };
        }
        
        if (!bot.personality) {
            bot.personality = Object.assign(this.generatePersonality(), bot.personality || {});
        }

        const potSize = game.pot;
        const callAmount = game.currentBetAmount - bot.currentBet;
        const minRaise = game.currentBetAmount + game.lastRaiseAmount;
        const bb = (game.blinds && game.blinds.big) ? game.blinds.big : 20;
        const my_bb = (bot.chips + bot.currentBet) / bb;

        // Position evaluation: 0.0 (Early) to 1.0 (Late)
        let activePlayers = game.activePlayersInRound || [];
        let positionValue = 0.5; // Default middle
        if (activePlayers.length > 1) {
            let myIndex = activePlayers.indexOf(bot.id);
            if (myIndex !== -1) {
                positionValue = myIndex / (activePlayers.length - 1);
            }
        }

        // Update Epsilon (decay over time to stabilize playstyle)
        bot.personality.handsPlayed = (bot.personality.handsPlayed || 0) + 1;
        bot.personality.epsilon = Math.max(0.01, (bot.personality.epsilon || 0.1) * 0.99);

        let { equity, isStrongDraw } = this.estimateHand(bot, game);
        let adjustedEquity = equity;

        // Pot odds
        const potOdds = this.calculatePotOdds(potSize, callAmount);

        // Action Generators
        const actionFold = () => ({ action: callAmount > 0 ? 'fold' : 'check', amount: 0 });
        const actionCheckCall = () => ({ action: callAmount > 0 ? 'call' : 'check', amount: 0 });
        const actionBet33 = () => ({ action: 'raise', amount: Math.max(minRaise, Math.floor(potSize * 0.33) + callAmount) });
        const actionBet75 = () => ({ action: 'raise', amount: Math.max(minRaise, Math.floor(potSize * 0.75) + callAmount) });
        const actionAllIn = () => ({ action: 'raise', amount: bot.chips + bot.currentBet });

        let actionObj = { action: 'fold', amount: 0 };
        const rand = Math.random();

        // 1. Epsilon-Greedy Exploration (Decreasing over time)
        if (rand < bot.personality.epsilon) {
            const actions = [actionFold, actionCheckCall, actionBet33, actionBet75, actionAllIn];
            actionObj = actions[Math.floor(Math.random() * actions.length)]();
            return this.finalizeAction(actionObj, callAmount, minRaise, bot);
        }

        // 2. Short Stack Push/Fold Mode (< 15 BB)
        if (my_bb < 15) {
            let pushThreshold = 0.55;
            pushThreshold -= (positionValue * 0.1); // Looser in late position
            
            if (adjustedEquity > pushThreshold || (isStrongDraw && positionValue > 0.7)) {
                actionObj = actionAllIn();
            } else {
                actionObj = actionFold();
            }
            return this.finalizeAction(actionObj, callAmount, minRaise, bot);
        }

        // 3. Normal / Deep Stack Logic
        
        // --- A. Pre-flop Early Position Filter ---
        if (game.gameState === 'pre_flop' && callAmount <= bb) {
            // Needs higher equity to open from early position
            const minOpenEquity = 0.65 - (positionValue * 0.2); // UTG: 0.65, BTN: 0.45
            if (adjustedEquity < minOpenEquity) {
                return this.finalizeAction(actionFold(), callAmount, minRaise, bot);
            }
        }

        // --- B. Reacting to Bets (Curing the Calling Station) ---
        if (callAmount > 0) {
            // MUST meet pot odds, unless drawing!
            if (adjustedEquity < potOdds && !isStrongDraw) {
                // 5% chance to bluff raise if deep
                if (Math.random() < 0.05 && my_bb > 30) {
                    actionObj = actionBet33();
                } else {
                    actionObj = actionFold();
                }
                return this.finalizeAction(actionObj, callAmount, minRaise, bot);
            }
        }

        // --- C. Value Betting and Bluffs ---
        if (adjustedEquity > 0.75) {
            // Monster hand
            actionObj = (potSize > bot.chips) ? actionAllIn() : actionBet75();
        } else if (adjustedEquity > 0.60) {
            // Good hand
            actionObj = (positionValue > 0.5) ? actionBet75() : actionCheckCall();
        } else if (isStrongDraw) {
            // Semi-bluff
            if (potOdds > 0.35) { // Too expensive to draw
                actionObj = actionFold();
            } else {
                actionObj = (Math.random() < 0.4) ? actionBet75() : actionCheckCall();
            }
        } else {
            // Weak hand / Air
            if (callAmount === 0) {
                // Positional bluff
                let bluffProb = 0.1 + (positionValue * 0.15);
                actionObj = (Math.random() < bluffProb) ? actionBet33() : actionCheckCall();
            } else {
                actionObj = actionFold();
            }
        }

        return this.finalizeAction(actionObj, callAmount, minRaise, bot);
    }

    // Safety checks before returning action
    static finalizeAction(actionObj, callAmount, minRaise, bot) {
        if (actionObj.action === 'raise') {
            if (bot.chips < (actionObj.amount - bot.currentBet)) {
                if (bot.chips + bot.currentBet > callAmount) {
                    actionObj.action = 'raise'; // All in
                    actionObj.amount = bot.chips + bot.currentBet;
                } else {
                    actionObj.action = 'call';
                    actionObj.amount = 0;
                }
            } else if (actionObj.amount < minRaise) {
                actionObj.amount = minRaise; // Ensure valid minimum raise
            }
        }
        
        if (actionObj.amount > 0) {
            actionObj.amount = Math.round(actionObj.amount);
        }
        return actionObj;
    }
}

module.exports = PokerBotGTO;
