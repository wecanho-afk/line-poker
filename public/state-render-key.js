/* Collapse transport duplicates into one DOM render. Server timestamps are intentionally omitted. */
(function (root) {
  function stateRenderKey(state) {
    if (!state) return '';
    const tournament = state.tournament_info ? {
      level: state.tournament_info.level,
      smallBlind: state.tournament_info.smallBlind,
      bigBlind: state.tournament_info.bigBlind,
      ante: state.tournament_info.ante,
      maxReEntry: state.tournament_info.maxReEntry,
      playersStats: state.tournament_info.playersStats
    } : null;
    const players = (state.players || []).map(player => [
      player.user_id, player.name, player.avatar, player.chips, player.current_bet,
      player.folded, player.all_in, player.last_action, player.is_current_player,
      player.can_raise, player.left_table, player.sitting_out, player.waiting_for_next_round,
      player.can_show_cards, player.shown_card_indexes, player.hand, player.time_cards,
      player.time_card_used_this_turn, player.hands_played, player.bot_style
    ]);
    return JSON.stringify([
      state.game_id, state.hand_number, state.game_state, state.game_mode, state.hand_limit,
      state.blinds, state.rebuy_default,
      state.pot, state.current_bet_amount, state.min_raise, state.current_player_id,
      state.action_count, state.latest_voice, state.turn_id, state.turn_deadline,
      Math.ceil((state.next_hand_remaining_ms || 0) / 1000), state.host_user_id,
      state.dealer_id, state.sb_id, state.bb_id, state.community_cards,
      state.runout_boards, state.runout_shared_count, state.runout_choice, state.winners,
      state.practice, state.cash_settlement, state.completed_hand?.id || '', tournament, players
    ]);
  }

  if (typeof module === 'object' && module.exports) module.exports = stateRenderKey;
  else root.PokerStateRenderKey = stateRenderKey;
})(typeof globalThis !== 'undefined' ? globalThis : this);
