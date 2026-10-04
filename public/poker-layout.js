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
  const reveal = document.createElement('section');
  reveal.id='show-cards-panel'; reveal.hidden=true;
  reveal.innerHTML='<strong>本手結束 · 秀牌</strong><p>選一張或兩張公開給全桌，公開後無法收回。</p><div class="show-card-actions"></div><p id="show-cards-status" role="status"></p>';
  byId('game-controls').after(reveal);
  let revealBusy=false;
  async function showSelectedCards(indexes, handNumber) {
    if(revealBusy)return;
    revealBusy=true;
    reveal.querySelectorAll('button').forEach(b=>b.disabled=true);
    const requestedGame=gameId;
    try {
      const result=await api('/show_cards','POST',{game_id:requestedGame,user_id:userId,hand_number:handNumber,card_indexes:indexes});
      if(gameId!==requestedGame)return;
      if(result.game_state)updateUI(result.game_state);
      if(!result.success)byId('show-cards-status').textContent=result.message||'秀牌未成功，請重試';
    } catch {
      if(gameId===requestedGame)byId('show-cards-status').textContent='連線中斷，請確認秀牌狀態後重試';
    } finally {
      revealBusy=false;
      if(proState && gameId===requestedGame)renderReveal(proState);
    }
  }
  function renderReveal(state) {
    const me=state.players.find(p=>p.user_id===userId);
    reveal.hidden=!me?.can_show_cards;
    if(reveal.hidden)return;
    const shown=me.shown_card_indexes||[];
    const actions=reveal.querySelector('.show-card-actions');actions.replaceChildren();
    const handNumber=state.hand_number;
    me.hand.forEach((card,index)=>{
      const button=document.createElement('button');button.className='show-one-card';
      button.innerHTML=formatCard(card)+'<span>'+ (shown.includes(index)?'已公開':'秀這張')+'</span>';
      button.setAttribute('aria-label',(shown.includes(index)?'已公開':'秀出')+'第'+(index+1)+'張 '+card);
      button.disabled=revealBusy||shown.includes(index);button.onclick=()=>showSelectedCards([index],handNumber);actions.append(button);
    });
    const both=document.createElement('button');both.className='btn-gold';both.textContent=shown.length===2?'兩張已公開':'秀兩張';
    both.disabled=revealBusy||shown.length===2;both.onclick=()=>showSelectedCards([0,1],handNumber);actions.append(both);
  }
  const originalUpdate=proUpdate;
  proUpdate=function(state){
    originalUpdate(state);
    renderReveal(state);
    const active=['pre_flop','flop','turn','river'].includes(state.game_state);
    const mine=state.current_player_id===userId && active;
    byId('action-status').textContent=mine?'輪到你了':active?'等待對手行動':streetLabels[state.game_state]||'準備入座';
    rail.classList.toggle('your-turn',mine);
  };
})();
