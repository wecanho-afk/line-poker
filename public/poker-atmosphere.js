/* Confirmed game-state effects, private hand hint and music mode switching. */
(() => {
  const button=document.createElement('button');button.id='music-toggle';button.type='button';button.className='btn-blue';button.textContent='♫ 開啟配樂';button.setAttribute('aria-pressed','false');button.dataset.mode='normal';
  document.getElementById('voice-toggle').before(button);
  const banner=document.createElement('div');banner.id='allin-announcement';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');document.querySelector('.table-stage').prepend(banner);
  const celebration=document.createElement('div');celebration.id='hand-celebration';celebration.hidden=true;celebration.setAttribute('role','status');celebration.setAttribute('aria-live','polite');celebration.innerHTML='<span></span><strong></strong><i></i><i></i><i></i><i></i><i></i><i></i>';document.getElementById('poker-table').append(celebration);
  const strength=document.createElement('div');strength.id='my-hand-strength';strength.hidden=true;strength.innerHTML='<span>你的目前牌力 · 僅自己可見</span><strong></strong><small>底牌＋已發出的公共牌</small>';document.getElementById('action-status').after(strength);
  let handKey='',seen=new Set(),tense=false,hideTimer,celebrationTimer,premiumHands=new Set(),lastStrengthEvent='';
  const music=PokerMusicPlayer.create(button);
  function setMode(mode){music.setMode(mode);}
  function clearEffect(){clearTimeout(hideTimer);banner.hidden=true;document.getElementById('poker-table').classList.remove('allin-impact');}
  function celebrate(analysis){
    clearTimeout(celebrationTimer);celebration.hidden=false;celebration.dataset.tier=analysis.tier;
    celebration.querySelector('span').textContent=analysis.headline;celebration.querySelector('strong').textContent=analysis.label;
    const table=document.getElementById('poker-table');table.classList.remove('hand-hit-effect');void table.offsetWidth;table.classList.add('hand-hit-effect');
    celebrationTimer=setTimeout(()=>{celebration.hidden=true;table.classList.remove('hand-hit-effect');},2600);
  }
  function syncAtmosphere(state){
    const me=state.players.find(p=>p.user_id===userId);
    const analysis=me?PokerHandStrength.analyze(me.hand,state.community_cards):null;
    strength.hidden=!analysis;
    strength.dataset.tier=analysis?.tier||'normal';
    if(analysis)strength.querySelector('strong').textContent=analysis.label;
    const key=state.game_id+':'+state.hand_number;
    if(key!==handKey){handKey=key;seen=new Set();tense=false;lastStrengthEvent='';clearEffect();clearTimeout(celebrationTimer);celebration.hidden=true;setMode('normal');}
    if(!premiumHands.has(key)&&proView==='table'&&PokerHandStrength.isPremiumStartingHand(me?.hand)){
      premiumHands.add(key);if(premiumHands.size>20)premiumHands.delete(premiumHands.values().next().value);
      const cards=document.querySelector('.poker-table .seat-0 .player-cards');
      if(cards){cards.classList.add('premium-edge-flash');setTimeout(()=>cards.classList.remove('premium-edge-flash'),2200);}
    }
    const strengthEvent=analysis&&analysis.tier!=='normal'?`${key}:${analysis.tier}:${analysis.label}`:'';
    if(strengthEvent&&strengthEvent!==lastStrengthEvent&&proView==='table'){lastStrengthEvent=strengthEvent;celebrate(analysis);}
    const newcomers=state.players.filter(p=>p.all_in&&!seen.has(p.user_id));
    for(const p of newcomers)seen.add(p.user_id);
    if(newcomers.length){tense=true;setMode('tense');if(proView==='table'){
      clearEffect();banner.textContent=newcomers.map(p=>p.name).join('、')+'  ALL IN · 全下';banner.hidden=false;
      const table=document.getElementById('poker-table');void table.offsetWidth;table.classList.add('allin-impact');
      hideTimer=setTimeout(clearEffect,2600);
    }}
    document.querySelectorAll('.player-seat').forEach(seat=>seat.classList.toggle('allin-seat',!!state.players.find(p=>p.user_id===seat.dataset.playerId)?.all_in));
    document.body.classList.toggle('allin-hand',tense&&proView==='table');
    const bet=state.current_bet_amount===0;
    const raise=document.querySelector('button[onclick="performAction(\'raise\')"]');raise.textContent=bet?'下注 Bet':'加注 Raise';
    const betLabel=document.querySelector('.raise-label');betLabel.textContent=bet?'下注金額 · Bet':'加注至總額 · Raise';
    document.getElementById('raiseAmount').setAttribute('aria-label',betLabel.textContent);
  }
  const update=proUpdate;proUpdate=function(state){update(state);syncAtmosphere(state);};
  const view=showProView;showProView=function(name){view(name);if(name!=='table'){clearEffect();clearTimeout(celebrationTimer);celebration.hidden=true;}document.body.classList.toggle('allin-hand',!!gameId&&tense&&name==='table');if(!gameId){handKey='';seen.clear();tense=false;premiumHands.clear();lastStrengthEvent='';clearEffect();setMode('normal');}};


})();
