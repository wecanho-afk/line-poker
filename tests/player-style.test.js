const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyze}=require('../public/player-style');
const action=(street,kind,advice=kind)=>({mine:true,street,action:kind,display_action:kind==='raise'&&street!=='pre_flop'?'bet':kind,advice:{action:advice}});
test('player style derives standard recent-hand indicators without opponent actions',()=>{
 const hands=[
  {net:80,board:['1','2','3','4','5'],actions:[action('pre_flop','raise'),action('flop','raise'),action('turn','check'),{mine:false,street:'river',action:'raise'}]},
  {net:-20,board:['1','2','3'],actions:[action('pre_flop','call'),action('flop','fold','check')]},
  {net:0,board:[],actions:[action('pre_flop','fold')]},
  {net:40,board:['1','2','3','4','5'],actions:[action('pre_flop','call'),action('flop','call'),action('turn','check'),action('river','check')]}
 ];
 const report=analyze(hands),values=Object.fromEntries(report.metrics.map(m=>[m.key,m.value]));
 assert.deepEqual(values,{vpip:75,pfr:25,aggression:17,showdown:50,win:50,alignment:90});
 assert.equal(report.totalNet,100);assert.equal(report.averageNet,25);assert.equal(report.hands,4);assert.equal(report.archetype,'資料累積中');
});
test('player style caps analysis at the most recent 500 hands and handles empty data',()=>{
 const empty=analyze([]);assert.equal(empty.hands,0);assert.ok(empty.metrics.every(m=>m.value===0));
 const many=Array.from({length:620},(_,i)=>({net:i<500?1:-100,board:[],actions:[action('pre_flop','raise')]}));
 const report=analyze(many);assert.equal(report.hands,500);assert.equal(report.limit,500);assert.equal(report.totalNet,500);assert.equal(report.metrics[0].value,100);assert.equal(report.metrics[1].value,100);
});
