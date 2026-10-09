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
  const timeCard=document.createElement('button');timeCard.id='time-card-btn';timeCard.type='button';timeCard.className='btn-blue';timeCard.hidden=true;
  const runoutChoice=document.createElement('section');runoutChoice.id='runout-choice-panel';runoutChoice.hidden=true;runoutChoice.setAttribute('aria-live','polite');
  const board = document.createElement('div'); board.className = 'board-center';
  board.append(document.querySelector('.pot-area'),byId('community-cards'));
  byId('poker-table').prepend(board);
  stage.append(room,byId('table-meta'),byId('poker-table'));
  rail.append(state,byId('turn-timer-display'),timeCard,runoutChoice,byId('tournament-info-display'),byId('practice-context'),byId('game-controls'),byId('repeat-practice'),tools,byId('lobby-return'));
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
  let featureBusy=false;
  timeCard.onclick=async()=>{
    if(featureBusy)return;featureBusy=true;timeCard.disabled=true;
    try{const result=await api('/use_time_card','POST',{game_id:gameId,user_id:userId,expected_action_count:proState?.action_count});if(result.game_state)updateUI(result.game_state);if(!result.success)alert(result.message||'時間卡使用失敗');}
    catch{alert('連線中斷，請確認時間卡狀態後重試');}finally{featureBusy=false;if(proState)renderTableFeatures(proState);}
  };
  async function chooseRunout(runs){
    if(featureBusy)return;featureBusy=true;runoutChoice.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const result=await api('/runout_choice','POST',{game_id:gameId,user_id:userId,runs,expected_action_count:proState?.action_count});if(result.game_state)updateUI(result.game_state);if(!result.success)alert(result.message||'選擇未送出');}
    catch{alert('連線中斷，請重新確認發牌次數');}finally{featureBusy=false;if(proState)renderTableFeatures(proState);}
  }
  function renderRunoutBoards(state){
    const area=byId('community-cards'),boards=state.runout_boards;
    area.classList.toggle('run-twice',Array.isArray(boards)&&boards.length===2);
    if(!Array.isArray(boards)||boards.length!==2)return;
    const shared=Math.max(0,Math.min(5,Number(state.runout_shared_count)||0));
    const common=shared?`<div class="runout-common"><span>共同牌</span>${boards[0].slice(0,shared).map(c=>formatCard(c)).join('')}</div>`:'';
    const lanes=boards.map((cards,index)=>`<div class="runout-lane"><b>${index+1}</b>${Array.from({length:5-shared},(_,offset)=>cards[shared+offset]?formatCard(cards[shared+offset]):'<div class="card-empty"></div>').join('')}</div>`).join('');
    area.innerHTML=common+`<div class="runout-branches">${lanes}</div>`;
    area.setAttribute('aria-label','公共牌發兩次');
  }
  function renderTableFeatures(state){
    const me=state.players.find(p=>p.user_id===userId),cards=me?.time_cards||0,remaining=50-((me?.hands_played||0)%50);
    timeCard.hidden=!gameId;timeCard.textContent=cards?`⏱ 30秒時間卡 ×${cards}`:`⏱ 再 ${remaining} 手獲得時間卡`;
    timeCard.disabled=featureBusy||cards<1||state.current_player_id!==userId||me?.time_card_used_this_turn;
    timeCard.title=me?.time_card_used_this_turn?'本回合已使用時間卡':cards?'輪到你時可增加 30 秒':`再完成 ${remaining} 手獲得 1 張`;
    const choice=state.runout_choice;runoutChoice.hidden=!choice;
    if(choice){
      const mine=choice.actor_id===userId,proposal=choice.proposed_runs;
      const title=choice.stage==='proposal'?`${choice.proposer_name} 目前落後，提議發牌次數`:`${choice.decider_name} 目前領先，做最後決定`;
      const detail=choice.stage==='proposal'?(mine?'你可以提議剩餘公共牌發一次或兩次。':`等待 ${choice.proposer_name} 提議發牌次數…`):(mine?`${choice.proposer_name} 提議發 ${proposal} 次；你決定最後發牌次數。`:`${choice.proposer_name} 提議發 ${proposal} 次，等待 ${choice.decider_name} 最後決定…`);
      runoutChoice.innerHTML=`<strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p>${mine?'<div><button type="button" data-runs="1">發 1 次</button><button type="button" data-runs="2">發 2 次</button></div>':''}`;
      runoutChoice.querySelectorAll('[data-runs]').forEach(button=>button.onclick=()=>chooseRunout(Number(button.dataset.runs)));
    }
    renderRunoutBoards(state);
  }
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
    renderTableFeatures(state);
    const active=['pre_flop','flop','turn','river'].includes(state.game_state);
    const mine=state.current_player_id===userId && active;
    byId('action-status').textContent=state.runout_choice?(state.runout_choice.actor_id===userId?'請選擇發牌次數':'等待發牌次數決定'):mine?'輪到你了':active?'等待對手行動':streetLabels[state.game_state]||'準備入座';
    rail.classList.toggle('your-turn',mine);
  };
})();

