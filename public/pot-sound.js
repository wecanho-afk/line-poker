/* A short original chip-clatter cue when a settled pot moves to its winner. */
(() => {
  let context,master,noiseBuffer,playedKey='',enabled=true,playToken=0;
  const active=new Set();
  function remember(source){active.add(source);source.addEventListener('ended',()=>active.delete(source),{once:true});return source;}
  function ensureAudio(){
    if(context)return true;const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return false;
    context=new AudioContext();master=context.createGain();const compressor=context.createDynamicsCompressor();
    master.gain.value=.42;compressor.threshold.value=-18;compressor.knee.value=12;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.14;master.connect(compressor);compressor.connect(context.destination);
    noiseBuffer=context.createBuffer(1,Math.floor(context.sampleRate*.32),context.sampleRate);const noise=noiseBuffer.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=(Math.random()*2-1)*Math.pow(1-i/noise.length,1.8);
    return true;
  }
  function envelope(gain,when,peak,duration){gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(peak,when+.003);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);}
  function panNode(value){if(!context.createStereoPanner)return master;const pan=context.createStereoPanner();pan.pan.value=value;pan.connect(master);return pan;}
  function chip(when,frequency,pan,weight=1){
    const output=panNode(pan),tone=context.createGain();envelope(tone,when,.038*weight,.075);tone.connect(output);
    [1,1.46].forEach((ratio,index)=>{const oscillator=remember(context.createOscillator());oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency*ratio,when);oscillator.frequency.exponentialRampToValueAtTime(frequency*ratio*.83,when+.07);const level=context.createGain();level.gain.value=index?.38:1;oscillator.connect(level);level.connect(tone);oscillator.start(when);oscillator.stop(when+.08);});
    const click=remember(context.createBufferSource()),filter=context.createBiquadFilter(),gain=context.createGain();click.buffer=noiseBuffer;filter.type='bandpass';filter.frequency.value=Math.min(6200,frequency*1.8);filter.Q.value=2.5;envelope(gain,when,.016*weight,.035);click.connect(filter);filter.connect(gain);gain.connect(output);click.start(when,0);click.stop(when+.04);
  }
  function schedule(){
    const token=++playToken,start=context.currentTime+.025,steps=[0,.042,.081,.125,.172,.224,.282,.347,.418,.5,.595,.705],tones=[1980,2420,2160,2740,2290,3050,2530,2860,2200,2680,2380,2920];
    steps.forEach((offset,index)=>chip(start+offset,tones[index],((index%5)-2)/2.5,index<3?.72:1));
    chip(start+.8,1180,-.25,1.2);chip(start+.89,940,.22,1.35);
    setTimeout(()=>{if(token===playToken)active.clear();},1100);
  }
  function play(){
    if(!enabled||!ensureAudio())return;const begin=()=>{if(enabled)schedule();};
    if(context.state==='running')begin();else context.resume().then(begin).catch(()=>{});
  }
  function stop(){playToken++;for(const source of active){try{source.stop();}catch{}}active.clear();}
  function unlock(){if(enabled&&ensureAudio()&&context.state==='suspended')context.resume().catch(()=>{});}
  function sync(state){
    if(state?.game_state!=='showdown'||!state.winners?.length)return;
    const key=`${state.game_id}:${state.hand_number}`;if(key===playedKey)return;playedKey=key;
    if(gameVoiceEnabled)play();
  }
  document.addEventListener('pointerdown',unlock,{passive:true});
  window.PokerPotSound={setEnabled(value){enabled=!!value;if(enabled)unlock();else stop();}};
  const update=proUpdate;proUpdate=function(state){update(state);sync(state);};
})();
