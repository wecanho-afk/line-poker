/* Layout only: the existing state, clock and action handlers remain authoritative. */
(() => {
  const byId = id => document.getElementById(id);
  const game = byId('game-view');
  if (/^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(location.hostname)) {
    const badge=document.createElement('span');badge.className='preview-badge';badge.textContent='測試版';document.querySelector('.header h1').append(badge);
  }
  const room = game.firstElementChild; room.className = 'room-strip';
  const tools = byId('add-bot-btn').parentElement; tools.className = 'table-tools';
  const stage = document.createElement('section'); stage.className = 'table-stage'; stage.setAttribute('aria-label','牌桌');
  const rail = document.createElement('aside'); rail.className = 'action-rail'; rail.setAttribute('aria-label','牌局操作');
  const state = document.createElement('div'); state.id = 'action-status'; state.setAttribute('role','status');
  const board = document.createElement('div'); board.className = 'board-center';
  board.append(document.querySelector('.pot-area'),byId('community-cards'));
  byId('poker-table').prepend(board);
  stage.append(room,byId('table-meta'),byId('poker-table'));
  rail.append(state,byId('turn-timer-display'),byId('tournament-info-display'),byId('practice-context'),byId('game-controls'),byId('repeat-practice'),tools,byId('lobby-return'));
  game.append(stage,rail);
  byId('game-controls').children[0].className='primary-actions';
  byId('game-controls').children[1].className='quick-actions';
  byId('game-controls').children[2].className='raise-actions';
  byId('game-controls').children[2].insertAdjacentHTML('beforebegin','<label class="raise-label" for="raiseAmount">加注至總額</label>');
  document.querySelectorAll('.avatar-option').forEach(option=>{option.tabIndex=0;option.setAttribute('role','button');option.setAttribute('aria-label','選擇頭像 '+option.textContent);option.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();option.click();}};});
  const labels = {playerNameInput:'你的暱稱',gameModeInput:'遊戲模式',initialChipsInput:'初始籌碼',smallBlindInput:'小盲注',blindDurationInput:'升盲秒數',maxReEntryInput:'重買次數',gameIdInput:'房間號碼'};
  Object.entries(labels).forEach(([id,label]) => {
    const field=byId(id);field.setAttribute('aria-label',label);
    if(id==='playerNameInput') return;
    const wrap=document.createElement('label');wrap.className='setup-field';
    const caption=document.createElement('span');caption.textContent=label;
    field.before(wrap);wrap.append(caption,field);
  });
  const shortcut=document.createElement('button');shortcut.className='practice-shortcut';shortcut.textContent='先練一手 → 場景練習';shortcut.onclick=()=>showProView('practice');byId('setup-view').append(shortcut);
  const originalUpdate=proUpdate;
  proUpdate=function(state){
    originalUpdate(state);
    const active=['pre_flop','flop','turn','river'].includes(state.game_state);
    const mine=state.current_player_id===userId && active;
    byId('action-status').textContent=mine?'輪到你了':active?'等待對手行動':streetLabels[state.game_state]||'準備入座';
    rail.classList.toggle('your-turn',mine);
  };
})();
