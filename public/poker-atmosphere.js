/* Confirmed game-state effects, private hand hint and music mode switching. */
(() => {
  const button=document.createElement('button');button.id='music-toggle';button.type='button';button.className='btn-blue';button.textContent='♫ 開啟配樂';button.setAttribute('aria-pressed','false');button.dataset.mode='normal';
  document.getElementById('voice-toggle').before(button);
  const banner=document.createElement('div');banner.id='allin-announcement';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');document.querySelector('.table-stage').prepend(banner);
  const strength=document.createElement('div');strength.id='my-hand-strength';strength.hidden=true;strength.innerHTML='<span>你的目前牌力 · 僅自己可見</span><strong></strong><small>底牌＋已發出的公共牌</small>';document.getElementById('action-status').after(strength);
  let handKey='',seen=new Set(),tense=false,hideTimer,premiumHands=new Set();
  const music=PokerMusicPlayer.create(button);
  function setMode(mode){music.setMode(mode);}
  function clearEffect(){clearTimeout(hideTimer);banner.hidden=true;document.getElementById('poker-table').classList.remove('allin-impact');}
  function syncAtmosphere(state){
    const me=state.players.find(p=>p.user_id===userId);
    const label=me?PokerHandStrength.describe(me.hand,state.community_cards):null;
    strength.hidden=!label;
    if(label)strength.querySelector('strong').textContent=label;
    const key=state.game_id+':'+state.hand_number;
    if(key!==handKey){handKey=key;seen=new Set();tense=false;clearEffect();setMode('normal');}
    if(!premiumHands.has(key)&&proView==='table'&&PokerHandStrength.isPremiumStartingHand(me?.hand)){
      premiumHands.add(key);if(premiumHands.size>20)premiumHands.delete(premiumHands.values().next().value);
      const cards=document.querySelector('.poker-table .seat-0 .player-cards');
      if(cards){cards.classList.add('premium-edge-flash');setTimeout(()=>cards.classList.remove('premium-edge-flash'),1000);}
    }
    const newcomers=state.players.filter(p=>p.all_in&&!seen.has(p.user_id));
    for(const p of newcomers)seen.add(p.user_id);
    if(newcomers.length){tense=true;setMode('tense');if(proView==='table'){
      clearEffect();banner.textContent=newcomers.map(p=>p.name).join('、')+'  ALL IN · 全下';banner.hidden=false;
      const table=document.getElementById('poker-table');void table.offsetWidth;table.classList.add('allin-impact');
      hideTimer=setTimeout(clearEffect,2600);
    }}
    document.querySelectorAll('.player-seat').forEach((seat,i)=>seat.classList.toggle('allin-seat',!!state.players[i]?.all_in));
    document.body.classList.toggle('allin-hand',tense&&proView==='table');
    const bet=state.current_bet_amount===0;
    const raise=document.querySelector('button[onclick="performAction(\'raise\')"]');raise.textContent=bet?'下注 Bet':'加注 Raise';
    const betLabel=document.querySelector('.raise-label');betLabel.textContent=bet?'下注金額 · Bet':'加注至總額 · Raise';
    document.getElementById('raiseAmount').setAttribute('aria-label',betLabel.textContent);
  }
  const update=proUpdate;proUpdate=function(state){update(state);syncAtmosphere(state);};
  const view=showProView;showProView=function(name){view(name);if(name!=='table')clearEffect();document.body.classList.toggle('allin-hand',!!gameId&&tense&&name==='table');if(!gameId){handKey='';seen.clear();tense=false;premiumHands.clear();clearEffect();setMode('normal');}};


})();
