/* Original procedural score: no external audio requests or copyrighted recordings. */
(() => {
  const button=document.createElement('button');button.id='music-toggle';button.type='button';button.className='btn-blue';button.textContent='♫ 開啟配樂';button.setAttribute('aria-pressed','false');button.dataset.mode='normal';
  document.getElementById('voice-toggle').before(button);
  const banner=document.createElement('div');banner.id='allin-announcement';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');document.querySelector('.table-stage').prepend(banner);
  const strength=document.createElement('div');strength.id='my-hand-strength';strength.hidden=true;strength.innerHTML='<span>你的目前牌力 · 僅自己可見</span><strong></strong><small>底牌＋已發出的公共牌</small>';document.getElementById('action-status').after(strength);
  let context,master,enabled=false,mode='normal',timer=null,next=0,step=0,handKey='',seen=new Set(),tense=false,hideTimer;
  const voices=new Set();
  function tone(midi,start,length,volume,type='sine') {
    const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.value=440*Math.pow(2,(midi-69)/12);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+length+.02);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};
  }
  function clearScore() { if(timer)clearInterval(timer);timer=null;for(const voice of voices){try{voice.stop();}catch{}}voices.clear(); }
  function schedule() {
    if(!enabled || document.hidden || context.state!=='running')return;
    if(next<context.currentTime)next=context.currentTime+.04;
    const urgent=mode==='tense',beat=60/(urgent?132:76)/2;
    while(next<context.currentTime+.18){
      const bar=Math.floor(step/8)%4,n=step%8;
      const root=[45,41,48,43][bar];
      if(urgent){
        tone(root-12+(n%2?12:0),next,.19,.075,'triangle');
        tone(root+[12,19,24,27,24,19,15,19][n],next,.13,.028,'triangle');
        if(n%2===0)tone(30,next,.1,.09,'sine');
        if(n===7)tone(root+25,next,.1,.02,'sine');
      } else {
        if(n===0){[0,7,12,15].forEach(interval=>tone(root+interval,next,2.7,.022,'sine'));tone(root-12,next,1.5,.06,'triangle');}
        if(n===2||n===6)tone(root+[19,24][n===2?0:1],next,.7,.035,'sine');
      }
      next+=beat;step++;
    }
  }
  function startScore() { clearScore();if(!enabled||!context||document.hidden||context.state!=='running')return;step=0;next=context.currentTime+.04;schedule();timer=setInterval(schedule,70); }
  function setMode(value) {if(mode===value)return;mode=value;button.dataset.mode=mode;if(enabled){button.textContent=mode==='tense'?'♫ 緊張配樂 · 關閉':'♫ 一般配樂 · 關閉';startScore();}}
  button.onclick=async()=>{
    if(button.disabled)return;button.disabled=true;
    try {
    if(enabled){enabled=false;clearScore();if(context)await context.suspend();button.textContent='♫ 開啟配樂';button.setAttribute('aria-pressed','false');return;}
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('unsupported');
      if(!context){context=new Audio();master=context.createGain();master.gain.value=.6;master.connect(context.destination);}
      await context.resume();enabled=true;button.setAttribute('aria-pressed','true');button.textContent=mode==='tense'?'♫ 緊張配樂 · 關閉':'♫ 一般配樂 · 關閉';startScore();
    }catch{button.textContent='♫ 無法播放 · 重試';enabled=false;button.setAttribute('aria-pressed','false');}
    } finally { button.disabled=false; }
  };
  document.addEventListener('visibilitychange',async()=>{if(!context)return;if(document.hidden){clearScore();await context.suspend();}else if(enabled){try{await context.resume();startScore();}catch{enabled=false;button.textContent='♫ 點此恢復配樂';button.setAttribute('aria-pressed','false');}}});
  function clearEffect(){clearTimeout(hideTimer);banner.hidden=true;document.getElementById('poker-table').classList.remove('allin-impact');}
  function syncAtmosphere(state){
    const me=state.players.find(p=>p.user_id===userId);
    const label=me?PokerHandStrength.describe(me.hand,state.community_cards):null;
    strength.hidden=!label;
    if(label)strength.querySelector('strong').textContent=label;
    const key=state.game_id+':'+state.hand_number;
    if(key!==handKey){handKey=key;seen=new Set();tense=false;clearEffect();setMode('normal');}
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
  const view=showProView;showProView=function(name){view(name);if(name!=='table')clearEffect();document.body.classList.toggle('allin-hand',!!gameId&&tense&&name==='table');if(!gameId){handKey='';seen.clear();tense=false;clearEffect();setMode('normal');}};
  window.addEventListener('pagehide',()=>{clearScore();if(context)context.suspend();});
  window.addEventListener('pageshow',()=>{if(enabled&&!document.hidden&&context)context.resume().then(startScore).catch(()=>{});});
})();
