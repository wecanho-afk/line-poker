const test=require('node:test');
const assert=require('node:assert/strict');
const stateRenderKey=require('../public/state-render-key');

function state(overrides={}){
 return {game_id:'room',hand_number:3,game_state:'flop',game_mode:'cash',hand_limit:0,pot:300,current_bet_amount:100,min_raise:200,current_player_id:'hero',action_count:4,latest_voice:'call',turn_id:7,turn_deadline:50000,next_hand_remaining_ms:0,host_user_id:'hero',dealer_id:'villain',sb_id:'hero',bb_id:'villain',community_cards:['As','Kh','2c'],runout_boards:null,runout_shared_count:0,runout_choice:null,winners:[],practice:null,cash_settlement:null,completed_hand:null,tournament_info:null,players:[{user_id:'hero',name:'Hero',chips:900,current_bet:100,folded:false,all_in:false,last_action:'call',is_current_player:true,can_raise:true,hand:['Qs','Qh']}],...overrides};
}

test('transport-only snapshots collapse to one render key',()=>{
 const first=state({snapshot_version:10,server_time:1000,turn_remaining_ms:19000});
 const duplicate=state({snapshot_version:11,server_time:2000,turn_remaining_ms:18000});
 assert.equal(stateRenderKey(first),stateRenderKey(duplicate));
});

test('visible game changes always produce a new render key',()=>{
 const original=state();
 for(const changed of [
  state({pot:500}),state({action_count:5}),state({current_player_id:'villain'}),
  state({community_cards:['As','Kh','2c','Td']}),
  state({players:[{...original.players[0],chips:800}]}),
  state({next_hand_remaining_ms:3900}),state({slot_hand:true,slot_interval:5,slot_forced_bet:400})
 ]) assert.notEqual(stateRenderKey(original),stateRenderKey(changed));
});

test('completed strategy advice refreshes the view even when the hand ID stays the same',()=>{
 const pending=state({completed_hand:{id:'same-hand',analysis_status:'pending'}});
 const ready=state({completed_hand:{id:'same-hand',analysis_status:'ready'}});
 assert.notEqual(stateRenderKey(pending),stateRenderKey(ready));
});
