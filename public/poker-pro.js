const actionLabels = { fold:'棄牌', check:'過牌', call:'跟注', raise:'加注至' };
const streetLabels = { pre_flop:'翻牌前', flop:'翻牌', turn:'轉牌', river:'河牌', showdown:'攤牌', waiting_for_players:'等待入座', waiting_for_next_round:'本手結束', game_over:'牌局結束' };
let proState = null, proView = 'table', reviewHands = [], selectedHand = 0, selectedStep = 0;
let historyKey;
try { historyKey = localStorage.getItem('poker-history-key'); if(!historyKey) { historyKey = crypto.randomUUID(); localStorage.setItem('poker-history-key',historyKey); } }
catch { historyKey = crypto.randomUUID(); }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function proUpdate(state) {
    proState = state;
    document.body.classList.toggle('playing', proView === 'table');
    document.getElementById('table-meta').textContent = `第 ${state.hand_number || 0} 手　 •　 ${streetLabels[state.game_state] || state.game_state}　 •　 盲注 ${state.blinds?.small || 0} / ${state.blinds?.big || 0}`;
    const banner = document.getElementById('practice-context');
    banner.hidden = !state.practice && !state.history_error;
    banner.textContent = state.history_error ? '這手牌未能儲存，請檢查伺服器儲存空間。' : state.practice ? `${state.practice.title}｜${state.practice.prompt}${state.practice.lesson ? '　解析：' + state.practice.lesson : ''}` : '';
    document.getElementById('repeat-practice').hidden = !state.practice || !['waiting_for_next_round','game_over'].includes(state.game_state);
    if(state.practice) document.getElementById('next-btn').style.display='none';
    document.getElementById('lobby-return').hidden = ['pre_flop','flop','turn','river','showdown'].includes(state.game_state);
    if (proView !== 'table') { document.getElementById('game-view').style.display='none'; document.getElementById('game-controls').style.display='none'; }
}
function showProView(view) {
    proView=view;
    document.body.classList.toggle('playing', view === 'table' && !!gameId);
    document.querySelectorAll('[data-pro-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.proView===view)));
    document.getElementById('setup-view').style.display=view==='table'&&!gameId?'block':'none';
    document.getElementById('game-view').style.display=view==='table'&&gameId?'flex':'none';
    document.getElementById('pro-panel').hidden=view==='table';
    if(view==='table') { if(proState) updateUI(proState); return; }
    document.getElementById('game-controls').style.display='none';
    if(view==='history') loadHistory(); else loadScenes();
}
async function loadScenes() {
    const panel=document.getElementById('pro-panel'); panel.innerHTML='<p role="status">載入練習場景…</p>';
    try {
        const res=await api('/practice_scenarios'); if(proView!=='practice')return;
        if(!res.success)throw Error('無法載入');
        panel.innerHTML='<div class="panel-top"><div><h2>經典場景練習</h2><div class="muted">從關鍵決策開始，與不同風格的對手打完一手。</div></div></div><div class="scene-grid">'+res.scenarios.map(s=>`<article class="scene-card"><span class="scene-tag">${escapeHTML(s.category)} / ${escapeHTML(s.difficulty)}</span><h3>${escapeHTML(s.title)}</h3><p>${escapeHTML(s.prompt)}</p><button class="btn-gold" data-scene="${escapeHTML(s.id)}">進入練習 →</button></article>`).join('')+'</div>';
        panel.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>startPractice(b.dataset.scene,b));
    } catch { if(proView==='practice')panel.innerHTML='<p role="alert">無法載入場景，請稍後再試。</p>'; }
}
async function startPractice(id, button) {
    if(proState && ['pre_flop','flop','turn','river','showdown'].includes(proState.game_state)) { alert('請先完成目前這手牌，再開始新的練習。'); showProView('table'); return; }
    if(!userId) { alert('玩家資料載入中，請稍後再試。'); return; }
    if(button)button.disabled=true;
    try {
        const res=await api('/practice_start','POST',{scenario_id:id,user_id:userId,user_name:document.getElementById('playerNameInput').value.trim()||userName||'練習玩家'});
        if(!res.success)throw Error(res.message||'無法開始練習');
        if(socket)socket.disconnect();
        gameId=res.game_id; isHost=true; knownCommunityCards=[]; knownPlayerCards={};
        initSocket(); showGame(); proState=res.game_state; showProView('table'); updateUI(res.game_state);
    }catch(e){alert(e.message);}finally{if(button)button.disabled=false;}
}
async function loadHistory() {
    const panel=document.getElementById('pro-panel'); panel.innerHTML='<p role="status">讀取手牌紀錄…</p>';
    try {
        const res=await api('/hand_history/'+encodeURIComponent(userId)); if(proView!=='history')return;
        if(!res.success)throw Error('無法讀取'); reviewHands=res.hands; selectedHand=0; selectedStep=0; renderHistory();
    }catch { if(proView==='history')panel.innerHTML='<p role="alert">無法讀取紀錄。請回到原本的瀏覽器，或稍後重試。</p>'; }
}
function renderHistory() {
    const panel=document.getElementById('pro-panel');
    panel.innerHTML='<div class="panel-top"><div><h2>手牌回顧</h2><div class="muted">最近 100 手 · 僅顯示你的底牌與當時可見資訊</div></div><button id="reload-history">重新整理</button></div>';
    document.getElementById('reload-history').onclick=loadHistory;
    if(!reviewHands.length) { panel.innerHTML+='<div class="empty-state">還沒有已完成的手牌。<br>打一手牌或完成場景練習，這裡就會出現逐步回顧。</div>';return; }
    panel.innerHTML+='<div class="history-layout"><div class="hand-list" aria-label="手牌清單">'+reviewHands.map((h,i)=>`<button data-hand="${i}" class="${i===selectedHand?'selected':''}">第 ${h.number} 手 · ${escapeHTML(h.hand.join(' '))}<br><span class="${h.net>=0?'positive':'negative'}">${h.net>=0?'+':''}${h.net}</span> · ${escapeHTML(h.scenario?.title||h.gameId)}<br><small>${escapeHTML(new Date(h.started).toLocaleString())}</small></button>`).join('')+'</div><article class="review-card" id="review-detail"></article></div>';
    document.getElementById('reload-history').onclick=loadHistory;
    panel.querySelectorAll('[data-hand]').forEach(b=>b.onclick=()=>{selectedHand=Number(b.dataset.hand);selectedStep=0;renderHistory();}); renderStep();
}
function renderStep() {
    const h=reviewHands[selectedHand], e=h.actions[selectedStep], detail=document.getElementById('review-detail');
    detail.innerHTML=`<h3>${escapeHTML(h.scenario?.title||'牌局決策回顧')}</h3><div class="muted">本手淨額 ${h.net>=0?'+':''}${h.net} · 得池者 ${escapeHTML(h.winners.join('、'))}</div><div class="review-cards">${h.hand.map(c=>formatCard(c)).join('')}</div>`;
    if(!e){detail.innerHTML+='<p>這手牌没有可回顧的主動決策。</p>';return;}
    detail.innerHTML+=`<div class="review-actions"><button id="review-prev" ${selectedStep===0?'disabled':''} aria-label="上一步">←</button><span>${selectedStep+1} / ${h.actions.length} · ${streetLabels[e.street]}</span><button id="review-next" ${selectedStep===h.actions.length-1?'disabled':''} aria-label="下一步">→</button></div><div class="review-cards">${e.board.map(c=>formatCard(c)).join('')||'<span class="muted">尚未發出公共牌</span>'}</div><div class="review-step"><strong>${escapeHTML(e.name)} ${actionLabels[e.action]} ${e.action==='raise'||e.action==='call'?e.amount:''}</strong><br><span class="muted">行動前底池 ${e.pot} · 剩餘 ${e.stack} · 跟注額 ${e.call} · ${escapeHTML(e.position)}</span>${e.advice?`<div class="advice"><strong>${e.action===e.advice.action?'方向符合建議':'可檢討的決策'}：${actionLabels[e.advice.action]} ${e.advice.amount||''}</strong><p>${escapeHTML(e.advice.reason)}</p><p class="muted">${escapeHTML(e.advice.caveat)}</p>${e.action==='raise'&&e.advice.action==='raise'?'<p>同為加注仍需比較尺寸；上述金額為模型建議總額。</p>':''}</div>`:'<p class="muted">對手行動紀錄；不使用對手底牌提供分析。</p>'}</div>`;
    document.getElementById('review-prev').onclick=()=>{selectedStep--;renderStep();};document.getElementById('review-next').onclick=()=>{selectedStep++;renderStep();};
}
document.querySelectorAll('[data-pro-view]').forEach(b=>b.onclick=()=>showProView(b.dataset.proView));
document.getElementById('repeat-practice').onclick=()=>startPractice(proState.practice.id);
document.getElementById('lobby-return').onclick=()=>{
    if(proState && ['pre_flop','flop','turn','river','showdown'].includes(proState.game_state))return;
    if(socket)socket.disconnect();
    if(timerInterval)clearInterval(timerInterval);if(tournamentInterval)clearInterval(tournamentInterval);
    gameId='';proState=null;isHost=false;knownCommunityCards=[];knownPlayerCards={};
    initSocket();showProView('table');document.getElementById('game-controls').style.display='none';
};
