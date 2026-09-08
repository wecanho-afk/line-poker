// Compatibility name: this is a live-player model, not a GTO solver.
const strategy = require('./poker-strategy');
module.exports = { ...strategy, generatePersonality: strategy.personality };
