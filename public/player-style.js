(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerPlayerStyle=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const HISTORY_LIMIT=500;
 const streets=new Set(['flop','turn','river']);
 const rate=(n,d)=>d?Math.round(n/d*100):0;
 function analyze(source){
  const hands=(Array.isArray(source)?source:[]).filter(h=>h&&Array.isArray(h.actions)).slice(0,HISTORY_LIMIT);
  let vpipHands=0,pfrHands=0,wins=0,showdowns=0,postflopActions=0,aggressiveActions=0,decisions=0,aligned=0,totalNet=0;
  for(const hand of hands){
   const mine=hand.actions.filter(a=>a?.mine);
   const pre=mine.filter(a=>a.street==='pre_flop');
   if(pre.some(a=>a.action==='call'||a.action==='raise'))vpipHands++;
   if(pre.some(a=>a.action==='raise'))pfrHands++;
   const post=mine.filter(a=>streets.has(a.street));
   postflopActions+=post.length;
   aggressiveActions+=post.filter(a=>a.action==='raise'||a.display_action==='bet').length;
   const advised=mine.filter(a=>a.advice&&a.advice.action);
   decisions+=advised.length;aligned+=advised.filter(a=>a.action===a.advice.action).length;
   if(!mine.some(a=>a.action==='fold')&&Array.isArray(hand.board)&&hand.board.length===5)showdowns++;
   const net=Number(hand.net)||0;totalNet+=net;if(net>0)wins++;
  }
  const count=hands.length;
  const metrics=[
   {key:'vpip',short:'VPIP',label:'主動入池率',value:rate(vpipHands,count),sample:count,help:'翻牌前跟注或加注的手牌比例'},
   {key:'pfr',short:'PFR',label:'翻前加注率',value:rate(pfrHands,count),sample:count,help:'翻牌前主動加注的手牌比例'},
   {key:'aggression',short:'進攻',label:'進攻頻率',value:rate(aggressiveActions,postflopActions),sample:postflopActions,help:'翻牌後下注或加注占你的行動比例'},
   {key:'showdown',short:'攤牌',label:'攤牌率',value:rate(showdowns,count),sample:count,help:'沒有棄牌並完成五張公共牌的手牌比例'},
   {key:'win',short:'勝率',label:'獲利手牌率',value:rate(wins,count),sample:count,help:'淨籌碼為正的手牌比例'},
   {key:'alignment',short:'決策',label:'建議符合率',value:rate(aligned,decisions),sample:decisions,help:'你的行動方向與牌局分析建議相同的比例'}
  ];
  const vpip=metrics[0].value,aggression=metrics[2].value;
  let archetype='資料累積中',summary='至少完成 5 手後，會依入池範圍與進攻頻率判斷主要風格。';
  if(count>=5){
   const loose=vpip>=34,aggressive=aggression>=42;
   archetype=loose?(aggressive?'鬆兇型 · LAG':'鬆被動型'):(aggressive?'緊兇型 · TAG':'緊被動型');
   summary=loose?(aggressive?'參與牌局範圍較廣，也常用下注施壓。':'參與牌局較多，但翻牌後較常以跟注或過牌延續。'):(aggressive?'選牌較謹慎，進池後傾向主動爭取底池。':'入池範圍保守，翻牌後也較少主動施壓。');
  }
  const notes=[];
  if(count<5)notes.push(`目前只有 ${count} 手，先累積更多牌局再觀察長期趨勢。`);
  else {
   const gap=vpip-metrics[1].value;
   if(gap>=15)notes.push('VPIP 與 PFR 差距較大：翻前跟注偏多，可檢查是否有太多被動入池。');
   else if(metrics[1].value>=vpip*.7)notes.push('翻前入池多半帶有加注，主動性清楚。');
   else notes.push('翻前跟注與加注比例接近，可繼續依位置調整起手牌範圍。');
   if(decisions<3)notes.push('可分析的個人決策還不多，建議符合率暫時只供參考。');
   else if(metrics[5].value>=70)notes.push('近期多數行動方向符合牌局建議，決策一致性良好。');
   else notes.push('手牌回顧中仍有可檢討的行動，優先查看大底池與轉牌、河牌決策。');
   if(showdowns>0&&metrics[4].value<30)notes.push('進入攤牌後的獲利手牌偏少，可回顧跟注到底的牌力與賠率。');
  }
  return {hands:count,limit:HISTORY_LIMIT,metrics,totalNet,averageNet:count?Math.round(totalNet/count*10)/10:0,wins,showdowns,decisions,aligned,archetype,summary,notes,confidence:Math.min(100,Math.round(count/100*100))};
 }
 return {analyze};
});
