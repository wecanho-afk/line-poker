const actionLabels = { fold:'棄牌', check:'過牌', call:'跟注', raise:'加注至' };
const streetLabels = { pre_flop:'翻牌前', flop:'翻牌', turn:'轉牌', river:'河牌', showdown:'攤牌', waiting_for_players:'等待入座', waiting_for_next_round:'本手結束', game_over:'牌局結束' };
let proState = null, proView = 'table', reviewHands = [], selectedHand = 0, selectedStep = 0;
let historyKey;
const handSaveStates = new Map();
let historyNotice = '', historyLoadVersion = 0;
const cacheOwner = () => userId + ':' + historyKey;
function mergeReviews(...groups) {
    return [...new Map(groups.flat().map(h=>[h.id,h])).values()].sort((a,b)=>b.started.localeCompare(a.started)).slice(0,100);
}
function updateHandSaveStatus(state) {
    let el=document.getElementById('hand-save-status');
    if(!el){el=document.createElement('div');el.id='hand-save-status';el.setAttribute('role','status');document.getElementById('practice-context').after(el);}
    const review=state.completed_hand;
    el.hidden=!review;
    if(!review)return;
    const owner=cacheOwner(), key=owner+':'+review.id;
    if(!handSaveStates.has(key)) {
        handSaveStates.set(key,'saving');
        HandCache.save(owner,[review]).then(()=>handSaveStates.set(key,'saved')).catch(()=>handSaveStates.set(key,'failed')).finally(()=>{
            if(proState?.completed_hand?.id===review.id && cacheOwner()===owner)updateHandSaveStatus(proState);
        });
    }
    el.textContent={saving:'正在儲存手牌…',saved:'手牌已儲存在此瀏覽器，可到「手牌回顧」檢討。',failed:'瀏覽器無法保存手牌，請允許網站儲存資料；目前仍可開啟回顧。'}[handSaveStates.get(key)];
}
let stateSyncTimer = null, stateSyncBusy = false;
function startStateSync() {
    if (stateSyncTimer) return;
    const status = document.createElement('div');
    status.id = 'sync-status'; status.setAttribute('role', 'status'); status.hidden = true;
    document.querySelector('.pro-nav').after(status);
    const sync = async () => {
        if (!gameId || stateSyncBusy) return;
        const requestedGame = gameId;
        stateSyncBusy = true;
        try {
            const response = await fetch(`${BACKEND_URL}/get_game_state/${encodeURIComponent(requestedGame)}/${encodeURIComponent(userId)}`, {
                headers: { 'X-History-Key': historyKey }, cache: 'no-store', signal: AbortSignal.timeout(8000)
            });
            const res = await response.json();
            if (gameId !== requestedGame) return;
            if (!response.ok || !res.success) {
                status.textContent = response.status === 404 ? '牌局已失效或伺服器已重新啟動，請重新進房。' : '無法同步牌局，正在重試…';
                status.hidden = false;
                if (response.status === 404) {
                    gameId = ''; proState = null; isHost = false;
                    document.getElementById('game-controls').style.display = 'none';
                    showProView('table');
                }
                return;
            }
            status.hidden = true;
            updateUI(res.game_state);
        } catch {
            if (gameId === requestedGame) { status.textContent = '連線暫時中斷，正在重新同步…'; status.hidden = false; }
        } finally { stateSyncBusy = false; }
    };
    stateSyncTimer = setInterval(sync, 1000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}
try { historyKey = localStorage.getItem('poker-history-key'); if(!historyKey) { historyKey = crypto.randomUUID(); localStorage.setItem('poker-history-key',historyKey); } }
catch { historyKey = crypto.randomUUID(); }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function proUpdate(state) {
    proState = state;
    updateHandSaveStatus(state);
    document.body.classList.toggle('playing', proView === 'table');
    document.getElementById('table-meta').textContent = `第 ${state.hand_number || 0} 手　 •　 ${streetLabels[state.game_state] || state.game_state}　 •　 盲注 ${state.blinds?.small || 0} / ${state.blinds?.big || 0}`;
    const banner = document.getElementById('practice-context');
    banner.hidden = !state.practice;
    banner.textContent = state.practice ? `${state.practice.title}｜${state.practice.prompt}${state.practice.lesson ? '　解析：' + state.practice.lesson : ''}` : '';
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
        const filter=document.createElement('label');
        filter.className='scene-filter';
        filter.innerHTML='選擇類型 <select aria-label="練習類型"><option value="">全部 '+res.scenarios.length+' 個場景</option>'+[...new Set(res.scenarios.map(s=>s.category))].map(c=>'<option>'+escapeHTML(c)+'</option>').join('')+'</select>';
        panel.querySelector('.panel-top').after(filter);
        filter.querySelector('select').onchange=e=>panel.querySelectorAll('.scene-card').forEach((card,i)=>card.hidden=!!e.target.value && res.scenarios[i].category!==e.target.value);
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
        initSocket(); showGame(); proState=res.game_state; showProView('table');
    }catch(e){alert(e.message);}finally{if(button)button.disabled=false;}
}
async function loadHistory() {
    const panel=document.getElementById('pro-panel'); panel.innerHTML='<p role="status">讀取手牌紀錄…</p>';
    const version=++historyLoadVersion, owner=cacheOwner();
    let local=[],cacheFailed=false;
    try { local=await HandCache.read(owner); } catch { cacheFailed=true; }
    if(proView!=='history'||version!==historyLoadVersion)return;
    const pending=proState?.completed_hand ? [proState.completed_hand] : [];
    reviewHands=mergeReviews(local,pending);selectedHand=0;selectedStep=0;
    historyNotice=cacheFailed?'瀏覽器儲存空間無法使用；本次回顧可能不會在重新整理後保留。':'保存在此瀏覽器；清除網站資料或換裝置不會保留紀錄。';
    if(reviewHands.length)renderHistory();
    try {
        const response=await fetch(`${BACKEND_URL}/hand_history/${encodeURIComponent(userId)}`,{headers:{'X-History-Key':historyKey},cache:'no-store',signal:AbortSignal.timeout(8000)});
        const res=await response.json();
        if(!response.ok||!res.success)throw Error('無法讀取');
        const merged=mergeReviews(local,pending,res.hands);
        try { await HandCache.save(owner,merged); }
        catch { historyNotice='目前可檢討，但瀏覽器無法保存紀錄，請允許網站儲存資料。'; }
        if(proView!=='history'||version!==historyLoadVersion)return;
        const selectedId=reviewHands[selectedHand]?.id;
        reviewHands=merged;selectedHand=Math.max(0,merged.findIndex(h=>h.id===selectedId));renderHistory();
    }catch {
        if(proView!=='history'||version!==historyLoadVersion)return;
        historyNotice=reviewHands.length?'伺服器暫時無法連線，顯示此瀏覽器保存的手牌。':'目前無法連線，且此瀏覽器沒有已保存的手牌。';
        renderHistory();
    }
}
function renderHistory() {
    const panel=document.getElementById('pro-panel');
    panel.innerHTML='<div class="panel-top"><div><h2>手牌回顧</h2><div class="muted">最近 100 手 · 僅顯示你的底牌與當時可見資訊</div></div><button id="reload-history">重新整理</button></div><p class="muted" role="status">'+escapeHTML(historyNotice)+'</p>';
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
    document.getElementById('sync-status').hidden=true;
    initSocket();showProView('table');document.getElementById('game-controls').style.display='none';
};
