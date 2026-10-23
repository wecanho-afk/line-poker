const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const merge=require('../public/review-merge');

test('a ready analysis replaces the pending review in the browser cache and open history',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/poker-pro.js'),'utf8');
 const update=source.slice(source.indexOf('function updateHandSaveStatus('),source.indexOf('let stateSyncTimer'));
 const status={},saved=[];
 const pending={id:'hand-1',started:'2026-10-23T00:00:00Z',hand:['As','Ah'],actions:[{mine:true,advice:null}],analysis_status:'pending'};
 const ready={...pending,actions:[{mine:true,advice:{action:'raise'}}],analysis_status:'ready'};
 let rendered=0;
 const context={document:{getElementById(){return status;}},cacheOwner:()=> 'hero:key',handSaveStates:new Map(),
  HandCache:{async save(owner,reviews){saved.push({owner,review:JSON.parse(JSON.stringify(reviews[0]))});}},
  proState:{completed_hand:pending},proView:'history',reviewHands:[pending],selectedHand:0,
  mergeReviews(...groups){return [...new Map(groups.flat().map(review=>[review.id,review])).values()];},renderHistory(){rendered++;}};
 vm.runInNewContext(update,context);
 context.updateHandSaveStatus(context.proState);await new Promise(setImmediate);
 assert.match(status.textContent,/分析中/);assert.equal(saved.length,1);
 context.proState={completed_hand:ready};context.updateHandSaveStatus(context.proState);await new Promise(setImmediate);
 assert.equal(saved.length,2);assert.equal(saved[1].review.analysis_status,'ready');assert.equal(saved[1].review.actions[0].advice.action,'raise');
 assert.equal(context.reviewHands[0].analysis_status,'ready');assert.equal(rendered,1);
 assert.doesNotMatch(status.textContent,/分析中/);
 context.updateHandSaveStatus(context.proState);await new Promise(setImmediate);assert.equal(saved.length,2);
});

test('an older pending history response cannot replace ready advice in the view or cache',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/poker-pro.js'),'utf8');
 let respond;const request=new Promise(resolve=>respond=resolve),saved=[];
 const status={hidden:false,textContent:''};
 const context=vm.createContext({userId:'hero',document:{getElementById:()=>status},PokerReviewMerge:merge,
  HandCache:{read:async()=>[],save:async(owner,reviews)=>saved.push(reviews.map(review=>review.analysis_status))},
  fetch:()=>request,AbortSignal,encodeURIComponent,BACKEND_URL:'http://localhost',console});
 vm.runInContext(source.slice(0,source.indexOf('let stateSyncTimer'))+source.slice(source.indexOf('async function loadHistory'),source.indexOf('function renderHistory'))+';renderHistory=()=>{};historyKey="key";',context);
 context.pending={id:'hand-1',started:'2026-10-23T00:00:00Z',analysis_status:'pending',hand:[],actions:[]};
 context.ready={...context.pending,analysis_status:'ready'};
 vm.runInContext('proView="history";proState={completed_hand:pending};',context);
 const load=vm.runInContext('loadHistory()',context);await new Promise(setImmediate);
 vm.runInContext('proState={completed_hand:ready};updateHandSaveStatus(proState);',context);await new Promise(setImmediate);
 respond({ok:true,json:async()=>({success:true,hands:[context.pending]})});await load;
 assert.equal(vm.runInContext('reviewHands[0].analysis_status',context),'ready');
 assert.ok(saved.length>=2);assert.ok(saved.every(statuses=>statuses[0]==='ready'));
});

test('review merging keeps completed advice and the newest 500 distinct hands',()=>{
 const pending={id:'same',started:'2026-10-23T00:00:00Z',analysis_status:'pending'};
 const ready={...pending,analysis_status:'ready',actions:[{advice:{action:'raise'}}]};
 assert.equal(merge([ready],[pending])[0],ready);assert.equal(merge([pending],[ready])[0],ready);
 const records=Array.from({length:501},(_,index)=>({id:String(index),started:new Date(Date.UTC(2026,0,1,0,0,index)).toISOString()}));
 const result=merge(records);assert.equal(result.length,500);assert.equal(result[0].id,'500');assert.equal(result.at(-1).id,'1');
});
