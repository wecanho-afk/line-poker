const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function harness(){
 let starts=0,updates=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},addEventListener(){},start(){starts++;},stop(){},frequency:param(),gain:param(),pan:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),Q:{value:0},type:''});
 class AudioContext {
  constructor(){this.state='running';this.currentTime=10;this.sampleRate=1000;this.destination=node();}
  createGain(){return node();}createDynamicsCompressor(){return node();}createStereoPanner(){return node();}createOscillator(){return node();}createBufferSource(){return node();}createBiquadFilter(){return node();}
  createBuffer(channels,length){const data=new Float32Array(length);return {getChannelData(){return data;}};}resume(){this.state='running';return Promise.resolve();}
 }
 const document={addEventListener(){}};
 const context={window:{AudioContext},document,gameVoiceEnabled:true,proUpdate(){updates++;},setTimeout(){},Math,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/pot-sound.js'),'utf8'),context);
 return {context,get starts(){return starts;},get updates(){return updates;}};
}

test('settled pot sound plays once per hand, including a split pot, and respects the sound toggle',()=>{
 const h=harness(),state=(hand,winners=['hero'])=>({game_state:'showdown',game_id:'room',hand_number:hand,winners});
 h.context.proUpdate({game_state:'river',game_id:'room',hand_number:1,winners:[]});assert.equal(h.starts,0);
 h.context.proUpdate(state(1));const first=h.starts;assert.ok(first>20);
 h.context.proUpdate(state(1));assert.equal(h.starts,first);
 h.context.proUpdate(state(2,['hero','other']));const second=h.starts;assert.equal(second,first*2);
 h.context.window.PokerPotSound.setEnabled(false);h.context.proUpdate(state(3));assert.equal(h.starts,second);
 h.context.window.PokerPotSound.setEnabled(true);h.context.proUpdate(state(4));assert.equal(h.starts,second+first);
 assert.equal(h.updates,6);
});

test('chip cue is generated locally and does not load an external audio file',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/pot-sound.js'),'utf8');
 assert.doesNotMatch(source,/https?:\/\/|\.mp3|\.wav/);assert.match(source,/createOscillator/);assert.match(source,/createBufferSource/);assert.match(source,/STEREO|createStereoPanner/i);
});
