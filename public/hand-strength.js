/* Best made hand from this viewer's known cards only; no odds or opponent data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerHandStrength=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const rank=c=>'23456789TJQKA'.indexOf(c[0])+2;
 const name=n=>({11:'J',12:'Q',13:'K',14:'A'}[n]||String(n));
 const span=high=>high===5?'A～5':name(high-4)+'～'+name(high);
 function score(cards){
  const ranks=cards.map(rank).sort((a,b)=>b-a), counts=new Map();ranks.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush=cards.length===5&&cards.every(c=>c[1]===cards[0][1]);
  const unique=[...counts.keys()].sort((a,b)=>b-a);let high=0;
  if(unique.length===5){if(unique[0]-unique[4]===4)high=unique[0];else if(unique.join(',')==='14,5,4,3,2')high=5;}
  if(flush&&high)return {key:[8,high],label:high===14?'皇家同花順':span(high)+' 同花順'};
  if(groups[0][1]===4)return {key:[7,groups[0][0],...ranks.filter(r=>r!==groups[0][0])],label:name(groups[0][0])+' 鐵支'};
  if(groups[0][1]===3&&groups[1]?.[1]===2)return {key:[6,groups[0][0],groups[1][0]],label:name(groups[0][0])+' 葫蘆（'+name(groups[1][0])+' 一對）'};
  if(flush)return {key:[5,...ranks],label:name(ranks[0])+' 高同花'};
  if(high)return {key:[4,high],label:span(high)+' 順子'};
  if(groups[0][1]===3)return {key:[3,groups[0][0],...ranks.filter(r=>r!==groups[0][0])],label:name(groups[0][0])+' 三條'};
  const pairs=groups.filter(g=>g[1]===2).map(g=>g[0]).sort((a,b)=>b-a);
  if(pairs.length>=2)return {key:[2,...pairs,...ranks.filter(r=>!pairs.includes(r))],label:pairs.map(name).join('、')+' 兩對'};
  if(pairs.length===1)return {key:[1,pairs[0],...ranks.filter(r=>r!==pairs[0])],label:name(pairs[0])+' 一對'};
  return {key:[0,...ranks],label:name(ranks[0])+' 高牌'};
 }
 function better(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta>0;}return false;}
 function describe(hole,board=[]){
  if(!Array.isArray(hole)||hole.length!==2||!Array.isArray(board)||board.length>5)return null;
  const cards=[...hole,...board];if(cards.some(c=>typeof c!=='string'||!/^[2-9TJQKA][shdc]$/.test(c))||new Set(cards).size!==cards.length)return null;
  if(cards.length<5)return score(cards).label;
  let best=null;
  function choose(from,picked){if(picked.length===5){const value=score(picked);if(!best||better(value.key,best.key))best=value;return;}for(let i=from;i<=cards.length-(5-picked.length);i++)choose(i+1,[...picked,cards[i]]);}
  choose(0,[]);return best.label;
 }
 function isPremiumStartingHand(hole){
  if(!Array.isArray(hole)||hole.length!==2||hole.some(c=>typeof c!=='string'||!/^[2-9TJQKA][shdc]$/.test(c))||hole[0]===hole[1])return false;
  const ranks=hole.map(c=>c[0]),suited=hole[0][1]===hole[1][1];
  if(ranks[0]===ranks[1])return 'JQKA'.includes(ranks[0]);
  const key=ranks.sort((a,b)=>'23456789TJQKA'.indexOf(b)-'23456789TJQKA'.indexOf(a)).join('');
  return key==='AK'||(key==='AQ'&&suited);
 }
 return {describe,isPremiumStartingHand};
});
