/* Original lounge-jazz arrangements for the browser synthesizer. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerMusicPlaylist=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const bar=(root,chord)=>({root,chord});
 const tracks={
  normal:[
   {id:'after-hours',title:'午夜牌局',feel:'暖鋼琴・低音貝斯・刷鼓',engine:'jazz',bpm:74,swing:.62,seed:3,voice:'vibes',scale:[62,64,65,67,69,71,72,74],bars:[bar(38,[50,53,57,60,64]),bar(43,[50,53,55,59,62]),bar(36,[48,52,55,59,62]),bar(41,[48,52,53,57,60]),bar(38,[50,53,57,60,64]),bar(43,[50,53,55,59,62]),bar(36,[48,52,55,59,62]),bar(45,[52,55,57,61,64])]},
   {id:'blue-chips',title:'藍色籌碼',feel:'藍調鋼琴・行走貝斯',engine:'jazz',bpm:80,swing:.64,seed:7,voice:'piano',scale:[60,62,63,65,67,69,70,72],bars:[bar(36,[48,51,55,58,62]),bar(41,[48,53,57,60]),bar(36,[48,51,55,58,62]),bar(36,[48,51,55,58,62]),bar(41,[48,53,57,60]),bar(42,[49,54,58,61]),bar(36,[48,51,55,58,62]),bar(43,[50,53,55,59,62])]},
   {id:'velvet-river',title:'絲絨河牌',feel:'深夜顫音琴・柔和刷鼓',engine:'jazz',bpm:69,swing:.58,seed:11,voice:'vibes',scale:[57,59,60,62,64,65,68,69],bars:[bar(33,[45,48,52,56,59]),bar(38,[45,50,53,57,60]),bar(43,[50,53,55,59,62]),bar(36,[48,52,55,59,62]),bar(41,[48,52,53,57,60]),bar(38,[45,50,53,57,60]),bar(40,[47,52,55,59,62]),bar(45,[52,55,57,61,64])]},
   {id:'last-call',title:'最後一杯',feel:'雞尾酒鋼琴・輕快搖擺',engine:'jazz',bpm:86,swing:.66,seed:17,voice:'piano',scale:[65,67,69,70,72,74,76,77],bars:[bar(41,[53,57,60,64]),bar(46,[53,58,62,65]),bar(39,[51,55,58,62]),bar(44,[51,56,60,63]),bar(41,[53,57,60,64]),bar(43,[50,55,58,62]),bar(45,[52,57,60,64]),bar(48,[55,60,64,67])]},
   {id:'green-felt',title:'綠氈微光',feel:'爵士三重奏・安靜夜場',engine:'jazz',bpm:77,swing:.61,seed:23,voice:'brass',scale:[55,57,59,60,62,64,66,67],bars:[bar(43,[50,55,59,62,64]),bar(40,[47,52,55,59,62]),bar(45,[52,55,57,61,64]),bar(38,[50,53,57,60,64]),bar(43,[50,55,59,62,64]),bar(36,[48,52,55,59,62]),bar(38,[50,53,57,60,64]),bar(43,[50,55,59,62,64])]}
  ],
  tense:[
   {id:'sharp-turn',title:'轉牌升溫',feel:'緊張爵士・切分低音',engine:'jazz',bpm:94,swing:.6,seed:29,voice:'brass',scale:[57,60,62,63,64,66,68,69],bars:[bar(33,[45,48,52,55,59]),bar(34,[46,49,53,56,60]),bar(38,[45,50,53,57,60]),bar(33,[45,48,52,55,59]),bar(41,[48,53,56,60,63]),bar(38,[45,50,53,57,60]),bar(40,[47,52,55,59,62]),bar(45,[52,55,57,61,64])]},
   {id:'final-raise',title:'最後加注',feel:'銅管短句・快速刷鼓',engine:'jazz',bpm:100,swing:.63,seed:31,voice:'brass',scale:[60,62,63,65,66,67,70,72],bars:[bar(36,[48,51,55,58,62]),bar(42,[49,54,58,61,65]),bar(41,[48,53,56,60,63]),bar(43,[50,53,55,59,62]),bar(36,[48,51,55,58,62]),bar(39,[46,51,54,58,61]),bar(41,[48,53,56,60,63]),bar(43,[50,53,55,59,62])]},
   {id:'cold-river',title:'冷冽河牌',feel:'低音鋼琴・懸疑爵士',engine:'jazz',bpm:90,swing:.57,seed:37,voice:'vibes',scale:[54,56,57,59,61,63,64,66],bars:[bar(30,[42,45,49,52,56]),bar(35,[42,47,50,54,57]),bar(40,[47,52,55,59,62]),bar(33,[45,49,52,56,59]),bar(38,[45,50,53,57,60]),bar(35,[42,47,50,54,57]),bar(37,[44,49,52,56,59]),bar(42,[49,54,57,61,64])]}
  ]
 };
 function create(random=Math.random){let mode='normal',normalIndex=0,tenseIndex=-1,bag=[];
  function draw(){if(!bag.length){bag=tracks.tense.map((_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag.at(-1)===tenseIndex&&bag.length>1)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}tenseIndex=bag.pop();}
  function current(){return tracks[mode][mode==='normal'?normalIndex:tenseIndex];}
  return {current,get mode(){return mode;},setMode(next){if(next!=='normal'&&next!=='tense')throw Error('Unknown music mode');if(mode===next)return false;mode=next;if(mode==='tense')draw();return true;},next(){if(mode==='normal')normalIndex=(normalIndex+1)%tracks.normal.length;else draw();return current();}};
 }
 return {tracks,create};
});
