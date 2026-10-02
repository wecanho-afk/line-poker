// Use server durations and a monotonic local clock, never the phone's wall clock.
(function (root) {
    function create(now = () => performance.now()) {
        const receipts = new WeakMap();
        let key = null, deadline = 0;
        return {
            capture(state, requestStarted) {
                if (state) {
                    const received = now();
                    receipts.set(state, { received, transit: Number.isFinite(requestStarted) ? Math.max(0, received - requestStarted) : 0 });
                }
            },
            accept(state) {
                if (!state.turn_deadline || state.turn_id == null) { key = null; deadline = 0; return; }
                const receipt = receipts.get(state) || { received: now(), transit: 0 };
                const remaining = Number.isFinite(state.turn_remaining_ms) ? state.turn_remaining_ms : Math.max(0, state.turn_deadline - state.server_time);
                if (!Number.isFinite(remaining)) { key = null; deadline = 0; return; }
                const nextKey = `${state.game_id}:${state.hand_number}:${state.turn_id}`;
                // Subtract the HTTP round trip conservatively. Repeated/stale
                // snapshots cannot restart or extend the same turn's countdown.
                const nextDeadline = receipt.received + Math.max(0, remaining - receipt.transit);
                deadline = key === nextKey ? Math.min(deadline, nextDeadline) : nextDeadline;
                key = nextKey;
            },
            remaining() { return key === null ? 0 : Math.max(0, deadline - now()); }
        };
    }
    if (typeof module === 'object' && module.exports) module.exports = { create };
    else root.PokerTurnClock = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
