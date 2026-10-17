const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {tracks,create}=require('../public/music-playlist');

test('normal soundtrack contains five original lounge-jazz arrangements and loops in order',()=>{
 assert.equal(tracks.normal.length,5);assert.equal(new Set(tracks.normal.map(track=>track.id)).size,5);
 assert.ok(tracks.normal.every(track=>track.engine==='jazz'&&track.bpm>=65&&track.bpm<=90&&track.bars.length===8&&track.scale.length>=7));
 assert.ok(tracks.normal.every(track=>track.bars.every(bar=>Number.isInteger(bar.root)&&bar.chord.length>=4)));
 const q=create(),first=q.current();for(let i=1;i<=5;i++)assert.equal(q.next(),tracks.normal[i%5]);assert.equal(q.current(),first);
});

test('tense jazz shuffle uses all three arrangements, avoids a boundary repeat and preserves normal position',()=>{
 const q=create(()=>.5);q.next();q.next();const normal=q.current();assert.equal(q.setMode('tense'),true);
 const three=[q.current().id];for(let i=0;i<2;i++)three.push(q.next().id);assert.equal(new Set(three).size,3);
 const last=q.current();assert.notEqual(q.next(),last);const same=q.current();assert.equal(q.setMode('tense'),false);assert.equal(q.current(),same);q.setMode('normal');assert.equal(q.current(),normal);
});

test('jazz is synthesized locally with piano, bass, brushes and no copied stream URL',()=>{
 const playlist=fs.readFileSync(path.join(__dirname,'../public/music-playlist.js'),'utf8');
 const player=fs.readFileSync(path.join(__dirname,'../public/music-player.js'),'utf8');
 assert.doesNotMatch(playlist,/https?:\/\/|\.mp3/);assert.match(player,/AudioContext/);
 for(const instrument of ['function piano','function bass','function noiseHit','function kick','function lead'])assert.match(player,new RegExp(instrument));
 assert.match(player,/navigator\.audioSession/);assert.match(player,/context\.resume\(\)/);
});

test('background music keeps a fixed level while game sounds play',()=>{
 const player=fs.readFileSync(path.join(__dirname,'../public/music-player.js'),'utf8');
 assert.match(player,/MUSIC_LEVEL=\.48/);assert.match(player,/master\.gain\.value=MUSIC_LEVEL/);
 assert.doesNotMatch(player,/PokerAudioMix|DUCK_LEVEL|duckUntil|setTargetAtTime/);
});
