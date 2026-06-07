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

    // Analyze board texture (Wet vs Dry)
    static analyzeBoardTexture(communityCards) {
        if (!communityCards || communityCards.length < 3) {
            return { isWet: false, wetnessScore: 0 };
        }
        
        let wetness = 0;
        const suits = {};
        const ranks = [];
        
        communityCards.forEach(c => {
            suits[c.suit] = (suits[c.suit] || 0) + 1;
            const rankVal = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14}[c.rank] || 0;
            ranks.push(rankVal);
        });
        
        const maxSuit = Math.max(...Object.values(suits), 0);
        if (maxSuit === 2) wetness += 3; // Flush draw possible
        if (maxSuit >= 3) wetness += 5; // Flush possible
        
        ranks.sort((a, b) => a - b);
        let connectedCount = 1;
        for (let i = 1; i < ranks.length; i++) {
            const diff = ranks[i] - ranks[i-1];
            if (diff === 1) connectedCount++;
        }
        if (connectedCount >= 2) wetness += 2;
        if (connectedCount >= 3) wetness += 4; // Straight draw possible
        
        return { isWet: wetness >= 4, wetnessScore: wetness };
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

        // --- Track Opponents (Simple Heuristics) ---
        bot.personality.opponentProfile = bot.personality.opponentProfile || {};
        let activePlayers = game.activePlayersInRound || [];
        
        // Track VPIP/Aggression loosely by observing active players pre-flop
        if (game.gameState === 'pre_flop') {
            activePlayers.forEach(pid => {
                if (pid !== bot.id) {
                    if (!bot.personality.opponentProfile[pid]) {
                        bot.personality.opponentProfile[pid] = { handsSeen: 0, actions: 0, raises: 0 };
                    }
                    // If they are not folded, they are taking actions
                    const p = game.players[pid];
                    if (p && !p.folded && p.currentBet > 0) {
                        bot.personality.opponentProfile[pid].actions += 0.5; // Roughly track looseness
                    }
                }
            });
        }

        const potSize = game.pot;
        const callAmount = game.currentBetAmount - bot.currentBet;
        const minRaise = game.currentBetAmount + game.lastRaiseAmount;
        const bb = (game.blinds && game.blinds.big) ? game.blinds.big : 20;
        const sb = (game.blinds && game.blinds.small) ? game.blinds.small : 10;
        const mRatio = (bot.chips + bot.currentBet) / (sb + bb);

        // Board Texture Analysis (Post-flop)
        const board = this.analyzeBoardTexture(game.communityCards);

        // Position evaluation: 0.0 (Early) to 1.0 (Late)
        let positionValue = 0.5; // Default middle
        if (activePlayers.length > 1) {
            let myIndex = activePlayers.indexOf(bot.id);
            if (myIndex !== -1) {
                positionValue = myIndex / (activePlayers.length - 1);
            }
        }

        // --- Opponent Exploitation Analysis ---
        let facingAggressorId = null;
        let isFacingCallingStation = false;
        let isFacingRock = false;

        if (callAmount > 0) {
            // Find who raised/bet
            for (const [pid, player] of Object.entries(game.players)) {
                if (player.currentBet === game.currentBetAmount && pid !== bot.id) {
                    facingAggressorId = pid;
                    break;
                }
            }
            if (facingAggressorId && bot.personality.opponentProfile[facingAggressorId]) {
                const profile = bot.personality.opponentProfile[facingAggressorId];
                if (profile.actions > 15) isFacingCallingStation = true; // Very loose
                if (profile.actions < 3 && bot.personality.handsPlayed > 10) isFacingRock = true; // Very tight
            }
        }

        // Update Epsilon (decay over time to stabilize playstyle)
        bot.personality.handsPlayed = (bot.personality.handsPlayed || 0) + 1;
        bot.personality.epsilon = Math.max(0.01, (bot.personality.epsilon || 0.1) * 0.99);

        let { equity, isStrongDraw } = this.estimateHand(bot, game);
        let adjustedEquity = equity;

        // --- High-Level: Nut Blocker Detection ---
        let hasNutBlocker = false;
        if (game.gameState !== 'pre_flop' && game.communityCards && game.communityCards.length >= 3) {
            const boardSuits = {};
            game.communityCards.forEach(c => { boardSuits[c.suit] = (boardSuits[c.suit] || 0) + 1; });
            for (const suit in boardSuits) {
                if (boardSuits[suit] >= 3) {
                    // Check if we hold the Ace of this suit, but we don't actually have the flush
                    const hasAceOfSuit = bot.hand.some(c => c.rank === 'A' && c.suit === suit);
                    const hasFlush = bot.hand.filter(c => c.suit === suit).length + boardSuits[suit] >= 5;
                    if (hasAceOfSuit && !hasFlush) hasNutBlocker = true;
                }
            }
        }

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

        // 2. Tournament Survival: M-Ratio & Push/Fold Phase
        if (mRatio < 10) {
            // Push/Fold phase: Only All-in or Fold
            let pushThreshold = 0.55;
            if (mRatio <= 5) pushThreshold = 0.40; // Desperation phase (Dead Zone)
            pushThreshold -= (positionValue * 0.1); // Looser in late position
            
            if (adjustedEquity > pushThreshold || (isStrongDraw && positionValue > 0.6)) {
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
            // Exploit: If facing a Rock (very tight player), respect their raises!
            if (isFacingRock && adjustedEquity < 0.70) {
                return this.finalizeAction(actionFold(), callAmount, minRaise, bot); // Fold unless we have a monster
            }

            // MUST meet pot odds, unless drawing!
            if (adjustedEquity < potOdds && !isStrongDraw) {
                // 5% chance to bluff raise if deep (M > 20)
                // Exploit: DO NOT bluff Calling Stations
                if (!isFacingCallingStation && Math.random() < 0.05 && mRatio > 20) {
                    actionObj = actionBet33();
                } else {
                    actionObj = actionFold();
                }
                return this.finalizeAction(actionObj, callAmount, minRaise, bot);
            }
        }

        // --- C. Value Betting, Bluffs, and High-Level Deception ---
        
        // High-Level: Trapping (Slowplaying)
        let isTrapping = false;
        if (adjustedEquity > 0.85 && !board.isWet && game.gameState !== 'river') {
            // 25% chance to set a trap with an absolute monster on a safe board
            if (Math.random() < 0.25) isTrapping = true;
        }

        if (adjustedEquity > 0.75) {
            // Monster hand
            if (isTrapping) {
                actionObj = actionCheckCall(); // SLOWPLAY: Just call or check
            } else if (board.isWet && game.gameState !== 'river') {
                actionObj = (potSize * 1.5 > bot.chips) ? actionAllIn() : actionBet75();
            } else {
                // Mix in Overbets (1.2x pot) on the river to look polar
                if (game.gameState === 'river' && Math.random() < 0.3) {
                    actionObj = (potSize * 1.5 > bot.chips) ? actionAllIn() : { action: 'raise', amount: Math.max(minRaise, Math.floor(potSize * 1.2) + callAmount) };
                } else if (isFacingCallingStation || activePlayers.length > 2) {
                    // Exploit: If against a calling station, just bet huge for value!
                    actionObj = (potSize > bot.chips) ? actionAllIn() : { action: 'raise', amount: Math.max(minRaise, potSize + callAmount) }; // Pot size bet
                } else {
                    actionObj = (potSize > bot.chips) ? actionAllIn() : actionBet75();
                }
            }
        } else if (adjustedEquity > 0.60) {
            // Good hand
            if (board.isWet) {
                actionObj = actionBet75();
            } else {
                actionObj = (positionValue > 0.5) ? actionBet33() : actionCheckCall();
            }
        } else if (isStrongDraw || hasNutBlocker) {
            // Semi-bluff OR Nut-Blocker Bluff
            if (potOdds > 0.35 && !hasNutBlocker) { // Too expensive to draw, but blockers can still bluff
                actionObj = actionFold();
            } else {
                // Exploit: Do not bluff calling stations, they won't fold anyway
                if (isFacingCallingStation) {
                    actionObj = actionCheckCall();
                } else {
                    let bluffProb = board.isWet ? 0.6 : 0.3;
                    if (hasNutBlocker && game.gameState === 'river') bluffProb = 0.8; // Huge bluff frequency on river with a nut blocker
                    
                    if (Math.random() < bluffProb) {
                        // High-Level: Nut blocker bluffs should be large to represent the nuts
                        actionObj = hasNutBlocker ? { action: 'raise', amount: Math.max(minRaise, potSize + callAmount) } : actionBet75();
                    } else {
                        actionObj = actionCheckCall();
                    }
                }
            }
        } else {
            // Weak hand / Air
            if (callAmount === 0) {
                // Positional bluff
                // Exploit: Bluff Rocks aggressively, but never bluff Calling Stations
                let bluffProb = 0.1 + (positionValue * 0.15);
                if (isFacingRock) bluffProb += 0.3; // Steal more from tight players
                if (isFacingCallingStation) bluffProb = 0; // Give up
                
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
