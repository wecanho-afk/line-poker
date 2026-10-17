const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function harness(){
 let plays=0,pauses=0,loads=0,updates=0,instances=0,ducks=0,pointerdown;
 class AudioPlayer {
  constructor(src){instances++;this.src=src;this.currentTime=0;this.muted=false;this.volume=1;this.preload='';this.playsInline=false;}
  load(){loads++;}play(){plays++;return Promise.resolve();}pause(){pauses++;}removeAttribute(name){if(name==='src')this.src='';}
 }
 const document={addEventListener(type,listener){if(type==='pointerdown')pointerdown=listener;}};
 const context={window:{Audio:AudioPlayer,PokerAudioMix:{duck(){ducks++;}}},document,gameVoiceEnabled:true,proUpdate(){updates++;},console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/pot-sound.js'),'utf8'),context);
 return {context,pointer(){pointerdown?.();},get plays(){return plays;},get pauses(){return pauses;},get loads(){return loads;},get instances(){return instances;},get ducks(){return ducks;},get updates(){return updates;}};
}

test('settled pot recording plays once per hand, including a split pot, and respects the sound toggle',()=>{
 const h=harness(),state=(hand,winners=['hero'])=>({game_state:'showdown',game_id:'room',hand_number:hand,winners});
 h.context.proUpdate({game_state:'river',game_id:'room',hand_number:1,winners:[]});assert.equal(h.plays,0);
 h.context.proUpdate(state(1));const first=h.plays;assert.equal(first,1);
 h.context.proUpdate(state(1));assert.equal(h.plays,first);
 h.context.proUpdate(state(2,['hero','other']));const second=h.plays;assert.equal(second,2);
 h.context.window.PokerPotSound.setEnabled(false);h.context.proUpdate(state(3));assert.equal(h.plays,second);
 h.context.window.PokerPotSound.setEnabled(true);h.context.proUpdate(state(4));assert.equal(h.plays,second+1);
 assert.equal(h.loads,1);assert.equal(h.ducks,3);assert.ok(h.pauses>=3);assert.equal(h.updates,6);
});

test('a pointer gesture unlocks the recording for later mobile playback',async()=>{
 const h=harness();h.pointer();await Promise.resolve();
 assert.equal(h.plays,1);assert.ok(h.pauses>=1);
});

test('leaving and entering the same room creates a fresh playable sound session',async()=>{
 const h=harness(),state={game_state:'showdown',game_id:'room',hand_number:1,winners:['hero']};
 h.context.window.PokerPotSound.enter('room');h.context.proUpdate(state);assert.equal(h.plays,1);
 h.context.window.PokerPotSound.leave();h.pointer();await Promise.resolve();
 h.context.window.PokerPotSound.enter('room');h.context.proUpdate(state);
 assert.equal(h.plays,3);assert.equal(h.instances,2);assert.equal(h.ducks,2);
});

test('chip cue uses the bundled CC0 recording and keeps its license record',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/pot-sound.js'),'utf8');
 const audio=path.join(__dirname,'../public/audio/poker-chip-collect.mp3');
 const licenses=fs.readFileSync(path.join(__dirname,'../public/audio/LICENSES.md'),'utf8');
 assert.doesNotMatch(source,/https?:\/\//);assert.match(source,/\/audio\/poker-chip-collect\.mp3/);
 assert.ok(fs.statSync(audio).size>20000);assert.match(licenses,/AllInPushChips\.wav/);assert.match(licenses,/Creative Commons Zero|CC0/i);
});
