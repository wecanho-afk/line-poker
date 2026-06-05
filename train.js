const fs = require('fs');

process.on('uncaughtException', err => { console.error('Uncaught Exception:', err); process.exit(1); });
process.on('unhandledRejection', err => { console.error('Unhandled Rejection:', err); process.exit(1); });

// 攔截定時器，實現 1000 倍速跳過等待
let timeoutId = 0;
global.setTimeout = (fn, delay) => {
    timeoutId++;
    const id = timeoutId;
    return setImmediate(() => {
        // console.log(`Executing timeout ${id}`);
        try { fn(); } catch (e) { console.error("Timeout Error:", e); process.exit(1); }
    });
};
global.clearTimeout = (id) => {
    clearImmediate(id);
};

const app = require('./app.js');
if (app.server) app.server.close();

const { TexasHoldemGame } = app;

const POPULATION_SIZE = 40; // 每代演化機器人數量
const GENERATIONS = 30; // 演化代數
const HANDS_PER_MATCH = 60; // 每代打幾手牌
const TABLE_SIZE = 8; // 每桌 8 人

// 不使用靜態對手，讓隨機生成的演化池進行「自我對弈 (Self-Play)」，找尋納什均衡
let population = [];
// 1. 初始化第一代種群 (演化池 - 完全隨機)
for (let i = 0; i < POPULATION_SIZE; i++) {
    population.push({
        id: `evo_${i}`,
        personality: {
            aggression: Math.random() * 3.0, 
            tightness: Math.random() * 3.0,  
            bluffFreq: Math.random() * 3.0,   
            posAware: Math.random() * 3.0,
            evAware: Math.random() * 3.0,
            stackAware: Math.random() * 3.0
        },
        fitness: 0
    });
}

function runGeneration(genIndex) {
    return new Promise((resolve) => {
        console.log(`\n--- 世代 ${genIndex + 1} ---`);
        population.forEach(p => p.fitness = 0);
        // 打亂座位
        population.sort(() => Math.random() - 0.5);
        
        let activeTables = 0;
        
        for (let t = 0; t < POPULATION_SIZE / TABLE_SIZE; t++) {
            const evoBots = population.slice(t * TABLE_SIZE, (t + 1) * TABLE_SIZE);
            const game = new TexasHoldemGame(`sim_${genIndex}_${t}`, evoBots[0].id, 'Host');
            game.gameMode = 'cash';
            game.initialChips = 10000;
            
            // 建立演化者
            evoBots.forEach(b => {
                if (b.id !== evoBots[0].id) {
                    game.addPlayer(b.id, b.id);
                }
                const p = game.players[b.id];
                p.isBot = true;
                p.personality = b.personality;
                p.chips = 10000;
            });
            
            let handsPlayed = 0;
            const originalPrepareNext = game.prepareNext;
            const origPlayerAction = game.playerAction;
            let actionCount = 0;
            game.playerAction = function(uid, action, amount) {
                actionCount++;
                if (actionCount > 2000) { console.error("Infinite action loop!"); process.exit(1); }
                origPlayerAction.call(this, uid, action, amount);
            };
            
            console.log(`Table ${t} initialized. Players: ${game.playersOrder.length}`);
            
            const origStartNewRound = game.startNewRound;
            game.startNewRound = function() {
                // console.log(`Table ${t} startNewRound called`);
                origStartNewRound.call(this);
            };

            // 攔截 prepareNext (每一局結束時會呼叫)
            game.prepareNext = function() {
                handsPlayed++;
                // console.log(`Table ${t} Hand ${handsPlayed} complete`);
                if (handsPlayed % 10 === 0) console.log(`Table ${t} played ${handsPlayed} hands...`);
                
                // 為了持續測試，籌碼歸零的自動補滿，但我們最後只看淨賺的籌碼
                evoBots.forEach(b => {
                    const p = this.players[b.id];
                    if (p.chips < 10000) {
                        p.chips = 10000; // 自動回血以繼續打
                    }
                    b.fitness += p.chips - 10000; // 記錄本局的淨獲利/虧損
                });

                if (handsPlayed >= HANDS_PER_MATCH) {
                    activeTables--;
                    if (activeTables === 0) resolve();
                    return; // 停止遊戲循環
                }
                originalPrepareNext.call(this);
                if (this.gameState === 'waiting_for_next_round') {
                    setImmediate(() => this.startNewRound());
                }
            };
            
            activeTables++;
            game.startNewRound();
            
            // If it stalled, let's see where it stalled
            // console.log(`Table ${t} startNewRound completed. state=${game.gameState}, currentPlayer=${game.getCurrentPlayer()?.name}`);
        }
    });
}

async function startEvolution() {
    console.log("=== 開始撲克 AI 基因進化演算法 (Self-Play GTO 逼近) ===");
    for (let g = 0; g < GENERATIONS; g++) {
        await runGeneration(g);
        
        let avgAgg = 0, avgTight = 0, avgBluff = 0, avgPos = 0, avgEv = 0, avgStack = 0;
        population.forEach(p => {
            avgAgg += p.personality.aggression;
            avgTight += p.personality.tightness;
            avgBluff += p.personality.bluffFreq;
            avgPos += p.personality.posAware;
            avgEv += p.personality.evAware;
            avgStack += p.personality.stackAware;
        });

        // 依照適應度 (贏得的籌碼) 排序
        population.sort((a, b) => b.fitness - a.fitness);
        
        const topBot = population[0];
        console.log(`\n--- 第 ${g + 1} 代演化結果 ---`);
        console.log(`[全體平均] Agg: ${(avgAgg/POPULATION_SIZE).toFixed(2)} | Tight: ${(avgTight/POPULATION_SIZE).toFixed(2)} | Bluff: ${(avgBluff/POPULATION_SIZE).toFixed(2)} | Pos: ${(avgPos/POPULATION_SIZE).toFixed(2)} | EV: ${(avgEv/POPULATION_SIZE).toFixed(2)} | Stack: ${(avgStack/POPULATION_SIZE).toFixed(2)}`);
        console.log(`[冠軍參數] (淨賺: ${topBot.fitness})`);
        console.log(`  Aggression:  ${topBot.personality.aggression.toFixed(3)}`);
        console.log(`  Tightness:   ${topBot.personality.tightness.toFixed(3)}`);
        console.log(`  BluffFreq:   ${topBot.personality.bluffFreq.toFixed(3)}`);
        console.log(`  PosAware:    ${topBot.personality.posAware.toFixed(3)} (位置意識)`);
        console.log(`  EVAware:     ${topBot.personality.evAware.toFixed(3)} (賠率意識)`);
        console.log(`  StackAware:  ${topBot.personality.stackAware.toFixed(3)} (SPR意識)`);
        
        // 交配與突變 (保留前 50% 的菁英，替換後 50%)
        const nextGen = [];
        for (let i = 0; i < POPULATION_SIZE / 2; i++) {
            // 菁英直接晉級
            nextGen.push(population[i]);
            
            // 菁英繁衍後代
            const parent1 = population[i];
            const parent2 = population[Math.floor(Math.random() * (POPULATION_SIZE / 4))]; // 跟前 25% 的強者配對
            
            const childPersonality = {
                aggression: (Math.random() > 0.5 ? parent1 : parent2).personality.aggression + (Math.random() - 0.5) * 0.2,
                tightness: (Math.random() > 0.5 ? parent1 : parent2).personality.tightness + (Math.random() - 0.5) * 0.2,
                bluffFreq: (Math.random() > 0.5 ? parent1 : parent2).personality.bluffFreq + (Math.random() - 0.5) * 0.2,
                posAware: (Math.random() > 0.5 ? parent1 : parent2).personality.posAware + (Math.random() - 0.5) * 0.2,
                evAware: (Math.random() > 0.5 ? parent1 : parent2).personality.evAware + (Math.random() - 0.5) * 0.2,
                stackAware: (Math.random() > 0.5 ? parent1 : parent2).personality.stackAware + (Math.random() - 0.5) * 0.2
            };
            
            // 範圍限制
            childPersonality.aggression = Math.max(0.1, Math.min(3.0, childPersonality.aggression));
            childPersonality.tightness = Math.max(0.1, Math.min(3.0, childPersonality.tightness));
            childPersonality.bluffFreq = Math.max(0.0, Math.min(3.0, childPersonality.bluffFreq));
            childPersonality.posAware = Math.max(0.0, Math.min(3.0, childPersonality.posAware));
            childPersonality.evAware = Math.max(0.0, Math.min(3.0, childPersonality.evAware));
            childPersonality.stackAware = Math.max(0.0, Math.min(3.0, childPersonality.stackAware));
            
            nextGen.push({
                id: `bot_gen${g}_child_${i}`,
                personality: childPersonality,
                fitness: 0
            });
        }
        population = nextGen;
    }
    
    console.log("\n=== 演化完成 ===");
    const golden = population[0].personality;
    console.log("最終黃金參數 (Golden Parameters):");
    console.log(golden);
    
    fs.writeFileSync('golden_bot.json', JSON.stringify(golden, null, 2));
    console.log("已將結果儲存至 golden_bot.json！");
}

startEvolution().catch(console.error);