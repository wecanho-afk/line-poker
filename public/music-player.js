/* Compact native audio player. Reusing one element keeps iPhone playback unlocked. */
window.PokerMusicPlayer={create(button){
 const queue=PokerMusicPlaylist.create(),audio=document.createElement('audio');
 let enabled=false,loadedSrc='',normalSrc='',normalTime=0,loadToken=0;
 audio.id='music-audio';audio.preload='metadata';audio.volume=.45;audio.setAttribute('playsinline','');
 document.body.append(audio);
 const tools=document.createElement('span');tools.id='music-mini-tools';tools.hidden=true;
 const next=document.createElement('button');next.type='button';next.id='music-next';next.textContent='⏭';next.title='下一首配樂';next.setAttribute('aria-label','下一首配樂');
 const status=document.createElement('span');status.id='music-player-status';status.className='music-screen-reader';status.setAttribute('role','status');
 button.after(tools);tools.append(next,status);
 if(navigator.audioSession)navigator.audioSession.type='playback';
 function show(text){status.textContent=text;button.title=text;}
 function render(playing=false){
  button.textContent=enabled?(queue.mode==='tense'?'♫ 緊張':'♫ 配樂'):'♫ 配樂';
  button.setAttribute('aria-pressed',String(enabled&&playing));tools.hidden=!enabled;
 }
 function rememberNormal(){if(queue.mode==='normal'&&loadedSrc){normalSrc=loadedSrc;normalTime=Number.isFinite(audio.currentTime)?audio.currentTime:0;}}
 function loadCurrent(startAt){
  if(!enabled)return;const track=queue.current(),token=++loadToken;loadedSrc=track.src;
  audio.src=track.src;audio.load();show((queue.mode==='tense'?'緊張配樂 · ':'一般配樂 · ')+track.title);render(false);
  if(startAt>0)audio.addEventListener('loadedmetadata',()=>{if(token===loadToken)try{audio.currentTime=Math.min(startAt,Math.max(0,(audio.duration||startAt)-.25));}catch{}},{once:true});
  const attempt=audio.play();if(attempt)attempt.catch(()=>{if(token===loadToken&&enabled){show('點一下配樂按鈕開始播放');render(false);}});
 }
 function turnOn(){enabled=true;render(false);const track=queue.current();loadCurrent(queue.mode==='normal'&&track.src===normalSrc?normalTime:0);}
 function turnOff(){enabled=false;audio.pause();render(false);show('配樂已關閉');}
 button.addEventListener('click',()=>enabled?turnOff():turnOn());
 next.addEventListener('click',()=>{rememberNormal();queue.next();if(queue.mode==='normal'){normalSrc='';normalTime=0;}loadCurrent(0);});
 audio.addEventListener('playing',()=>{if(enabled)render(true);});
 audio.addEventListener('pause',()=>render(false));
 audio.addEventListener('ended',()=>{if(enabled){queue.next();loadCurrent(0);}});
 audio.addEventListener('error',()=>{if(enabled){show('配樂載入失敗，請切換下一首');render(false);}});
 return {setMode(mode){if(mode===queue.mode)return;rememberNormal();queue.setMode(mode);button.dataset.mode=mode;if(enabled){const track=queue.current();loadCurrent(mode==='normal'&&track.src===normalSrc?normalTime:0);}}};
}};
