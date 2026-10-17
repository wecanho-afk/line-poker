/* Original lounge jazz rendered with Web Audio after the player's tap. */
window.PokerMusicPlayer={create(button){
 const queue=PokerMusicPlaylist.create();
 const tools=document.createElement('span');tools.id='music-mini-tools';tools.hidden=true;
 const next=document.createElement('button');next.type='button';next.id='music-next';next.textContent='⏭';next.title='下一首爵士配樂';next.setAttribute('aria-label','下一首爵士配樂');
 const status=document.createElement('span');status.id='music-player-status';status.className='music-screen-reader';status.setAttribute('role','status');
 button.after(tools);tools.append(next,status);
 const MUSIC_LEVEL=.48,DUCK_LEVEL=.2;
 let enabled=false,context,bus,master,noiseBuffer,loopTimer,duckTimer,duckUntil=0,playToken=0,loopCount=0;
 const active=new Set();
 if(navigator.audioSession)navigator.audioSession.type='playback';
 function show(text){status.textContent=text;button.title=text;}
 function render(playing=false){button.textContent=enabled?(queue.mode==='tense'?'♫ 緊張':'♫ 爵士'):'♫ 爵士';button.setAttribute('aria-pressed',String(enabled&&playing));button.dataset.engine='jazz';tools.hidden=!enabled;}
 function remember(source){active.add(source);source.addEventListener('ended',()=>active.delete(source),{once:true});return source;}
 function midi(note){return 440*Math.pow(2,(note-69)/12);}
 function makeImpulse(ctx){const length=Math.floor(ctx.sampleRate*1.7),impulse=ctx.createBuffer(2,length,ctx.sampleRate);for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.4);}return impulse;}
 function makeNoise(ctx){const length=Math.floor(ctx.sampleRate*1.2),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=Math.random()*2-1;return buffer;}
 function setMasterLevel(value,timeConstant){if(!master||!context)return;const gain=master.gain,now=context.currentTime;gain.cancelScheduledValues?.(now);if(gain.setTargetAtTime)gain.setTargetAtTime(value,now,timeConstant);else gain.value=value;}
 function restoreMix(){clearTimeout(duckTimer);const remaining=duckUntil-Date.now();if(remaining>0){duckTimer=setTimeout(restoreMix,remaining);return;}setMasterLevel(MUSIC_LEVEL,.12);}
 function duck(duration=1200){duckUntil=Math.max(duckUntil,Date.now()+Math.max(300,duration));setMasterLevel(DUCK_LEVEL,.035);clearTimeout(duckTimer);duckTimer=setTimeout(restoreMix,Math.max(0,duckUntil-Date.now()));}
 window.PokerAudioMix={duck};
 function ensureAudio(){
  if(context)return true;const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return false;
  context=new AudioContext();bus=context.createGain();master=context.createGain();const dry=context.createGain(),wet=context.createGain(),reverb=context.createConvolver(),compressor=context.createDynamicsCompressor();
  bus.gain.value=.82;dry.gain.value=.88;wet.gain.value=.16;master.gain.value=Date.now()<duckUntil?DUCK_LEVEL:MUSIC_LEVEL;reverb.buffer=makeImpulse(context);
  compressor.threshold.value=-20;compressor.knee.value=15;compressor.ratio.value=3;compressor.attack.value=.015;compressor.release.value=.3;
  bus.connect(dry);dry.connect(compressor);bus.connect(reverb);reverb.connect(wet);wet.connect(compressor);compressor.connect(master);master.connect(context.destination);noiseBuffer=makeNoise(context);return true;
 }
 function envelope(gain,when,peak,duration,attack=.012){gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),when+attack);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);}
 function piano(notes,when,duration,accent=.8){
  const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='lowpass';filter.frequency.setValueAtTime(2350,when);filter.frequency.exponentialRampToValueAtTime(1050,when+duration);filter.Q.value=.7;envelope(gain,when,.036*accent,duration,.009);filter.connect(gain);gain.connect(bus);
  notes.forEach((note,index)=>{const oscillator=remember(context.createOscillator());oscillator.type=index%2?'sine':'triangle';oscillator.frequency.value=midi(note);oscillator.detune.value=(index-2)*1.7;oscillator.connect(filter);oscillator.start(when);oscillator.stop(when+duration+.03);});
 }
 function bass(note,when,duration,accent=1){
  const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='lowpass';filter.frequency.value=520;filter.Q.value=.9;envelope(gain,when,.105*accent,duration,.014);filter.connect(gain);gain.connect(bus);
  ['sine','triangle'].forEach((type,index)=>{const oscillator=remember(context.createOscillator());oscillator.type=type;oscillator.frequency.value=midi(note+(index?12:0));oscillator.detune.value=index?-4:0;const level=context.createGain();level.gain.value=index?.16:1;oscillator.connect(level);level.connect(filter);oscillator.start(when);oscillator.stop(when+duration+.03);});
 }
 function noiseHit(when,duration,frequency,peak,type='bandpass'){const source=remember(context.createBufferSource()),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.8;envelope(gain,when,peak,duration,.006);source.connect(filter);filter.connect(gain);gain.connect(bus);source.start(when,Math.random()*.7);source.stop(when+duration+.02);}
 function kick(when,accent=1){const oscillator=remember(context.createOscillator()),gain=context.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(82,when);oscillator.frequency.exponentialRampToValueAtTime(44,when+.13);envelope(gain,when,.055*accent,.18,.004);oscillator.connect(gain);gain.connect(bus);oscillator.start(when);oscillator.stop(when+.2);}
 function lead(note,when,duration,voice){
  const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='lowpass';filter.frequency.value=voice==='brass'?1750:3100;filter.Q.value=voice==='brass'?1.7:.6;envelope(gain,when,voice==='brass'?.037:.045,duration,voice==='brass'?.055:.012);filter.connect(gain);gain.connect(bus);
  const shapes=voice==='brass'?['sawtooth','sine']:voice==='piano'?['triangle']:['sine','sine'];
  shapes.forEach((shape,index)=>{const oscillator=remember(context.createOscillator());oscillator.type=shape;oscillator.frequency.value=midi(note+(voice==='vibes'&&index?12:0));oscillator.detune.value=index?3:-2;const level=context.createGain();level.gain.value=index?(voice==='brass'?.09:.22):1;oscillator.connect(level);level.connect(filter);oscillator.start(when);oscillator.stop(when+duration+.04);});
 }
 function schedule(track,token){
  const beat=60/track.bpm,start=context.currentTime+.08,barDuration=beat*4,swing=(track.swing-.5)*beat;
  track.bars.forEach((bar,index)=>{
   const at=start+index*barDuration,nextBar=track.bars[(index+1)%track.bars.length];
   piano(bar.chord,at,beat*1.55,index===0?1:.82);piano(bar.chord,at+beat*2.5+swing,beat*1.05,.58);
   const walk=[bar.root,bar.root+7,bar.root+12,Math.max(bar.root,nextBar.root-1)];walk.forEach((note,step)=>bass(note,at+beat*step+(step%2?swing*.32:0),beat*.72,step===0?1:.7));
   for(let step=0;step<4;step++){const hit=at+beat*step+(step%2?swing*.24:0);noiseHit(hit,beat*.28,2300,step%2?.027:.017);if(step===0||step===2)kick(hit,step===0?1:.65);noiseHit(hit+beat*.5+swing,beat*.11,6200,.008,'highpass');}
   if((index+loopCount)%2===0){[1.5,2.5,3.5].forEach((position,n)=>{if((track.seed+index+n+loopCount)%5!==0){const scaleIndex=(track.seed+index*2+n*3+loopCount)%track.scale.length;lead(track.scale[scaleIndex],at+beat*position+swing,beat*(n===2?.72:.52),track.voice);}});}
  });
  const duration=track.bars.length*barDuration;loopTimer=setTimeout(()=>{if(enabled&&token===playToken){loopCount++;schedule(track,token);}},Math.max(100,duration*1000-100));
 }
 function stopArrangement(){playToken++;clearTimeout(loopTimer);for(const source of active){try{source.stop();}catch{}}active.clear();}
 function startCurrent(){if(!enabled||!ensureAudio())return;stopArrangement();const token=playToken,track=queue.current();loopCount=0;show((queue.mode==='tense'?'緊張爵士 · ':'牌桌爵士 · ')+track.title+' · '+track.feel);render(true);schedule(track,token);}
 async function turnOn(){if(!ensureAudio()){show('此瀏覽器不支援爵士配樂');render(false);return;}enabled=true;try{await context.resume();startCurrent();}catch{enabled=false;show('點一下爵士配樂按鈕開始播放');render(false);}}
 function turnOff(){enabled=false;stopArrangement();if(context)context.suspend().catch(()=>{});render(false);show('爵士配樂已關閉');}
 button.addEventListener('click',()=>enabled?turnOff():turnOn());
 next.addEventListener('click',async()=>{queue.next();if(!enabled)return;try{await context.resume();startCurrent();}catch{show('無法切換爵士配樂');}});
 render(false);
 return {setMode(mode){if(mode===queue.mode)return;queue.setMode(mode);button.dataset.mode=mode;if(enabled)startCurrent();}};
}};
