/* A recorded poker-chip push plays once when a settled pot moves to its winner. */
(() => {
  const CUE_URL='/audio/poker-chip-collect.mp3';
  let audio,playedKey='',enabled=true,unlocked=false,unlocking=false;

  function ensureAudio(){
    if(audio)return audio;
    const AudioPlayer=window.Audio;
    if(!AudioPlayer)return null;
    audio=new AudioPlayer(CUE_URL);
    audio.preload='auto';
    audio.playsInline=true;
    audio.volume=.72;
    audio.load?.();
    return audio;
  }

  function stop(){
    if(!audio)return;
    audio.pause();
    try{audio.currentTime=0;}catch{}
  }

  function play(){
    if(!enabled)return;
    const cue=ensureAudio();
    if(!cue)return;
    cue.pause();
    try{cue.currentTime=0;}catch{}
    cue.muted=false;
    cue.volume=.72;
    const promise=cue.play();
    promise?.catch?.(()=>{});
  }

  // iOS browsers allow later game-event playback after a media element has
  // been started once from a real pointer gesture.
  function unlock(){
    if(!enabled||unlocked||unlocking)return;
    const cue=ensureAudio();
    if(!cue)return;
    unlocking=true;
    cue.muted=true;
    const finish=success=>{
      cue.pause();
      try{cue.currentTime=0;}catch{}
      cue.muted=false;
      cue.volume=.72;
      unlocked=success;
      unlocking=false;
    };
    const promise=cue.play();
    if(promise?.then)promise.then(()=>finish(true),()=>finish(false));
    else finish(true);
  }

  function sync(state){
    if(state?.game_state!=='showdown'||!state.winners?.length)return;
    const key=`${state.game_id}:${state.hand_number}`;
    if(key===playedKey)return;
    playedKey=key;
    if(gameVoiceEnabled)play();
  }

  document.addEventListener('pointerdown',unlock,{passive:true});
  window.PokerPotSound={
    setEnabled(value){enabled=!!value;if(enabled)ensureAudio();else stop();}
  };
  const update=proUpdate;
  proUpdate=function(state){update(state);sync(state);};
})();
