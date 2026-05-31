function determineWinnerSidePotTest() {
    // Mock players
    const players = {
        'A': { userId: 'A', name: 'Alice', folded: false, sittingOut: false, invested: 100, chips: 0, handScore: 40, handDesc: 'Flush' },
        'B': { userId: 'B', name: 'Bob', folded: false, sittingOut: false, invested: 500, chips: 0, handScore: 20, handDesc: '2 Pairs' },
        'C': { userId: 'C', name: 'Charlie', folded: false, sittingOut: false, invested: 500, chips: 0, handScore: 30, handDesc: '3 of a Kind' },
        'D': { userId: 'D', name: 'Dave', folded: true, sittingOut: false, invested: 50, chips: 500, handScore: 0, handDesc: 'Fold' }
    };
    let pot = 1150; // Total 1150

    const investors = Object.values(players).filter(p => p.invested > 0);
    const uniqueInvestments = [...new Set(investors.map(p => p.invested))].sort((a, b) => a - b);
    
    let previousInvested = 0;
    const subPots = [];

    for (const level of uniqueInvestments) {
        const contribution = level - previousInvested;
        let subPotAmount = 0;
        const eligiblePlayers = [];

        for (const p of investors) {
            if (p.invested >= level) {
                subPotAmount += contribution;
                if (!p.folded && !p.sittingOut) {
                    eligiblePlayers.push(p);
                }
            }
        }

        if (subPotAmount > 0) {
            subPots.push({ amount: subPotAmount, eligiblePlayers });
        }
        previousInvested = level;
    }

    const winnings = new Map();
    let winnersList = [];

    for (const subPot of subPots) {
        if (subPot.eligiblePlayers.length === 0) continue;

        let maxScore = -1;
        for (const p of subPot.eligiblePlayers) {
            if (p.handScore > maxScore) maxScore = p.handScore;
        }

        const potWinners = subPot.eligiblePlayers.filter(p => p.handScore === maxScore);
        const share = Math.floor(subPot.amount / potWinners.length);
        
        potWinners.forEach(w => {
            winnings.set(w, (winnings.get(w) || 0) + share);
            if (!winnersList.includes(w)) winnersList.push(w);
        });
    }

    const winnerMessages = [];
    for (const [w, amount] of winnings.entries()) {
        w.chips += amount;
        winnerMessages.push(`${w.name} (${w.handDesc}) 贏得 $${amount}`);
    }

    console.log(winnerMessages.join(', '));
}

determineWinnerSidePotTest();
