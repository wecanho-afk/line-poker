/* Audio selected from the user-provided MapleMusicV3.0Final archive. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerMusicPlaylist=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const tracks={
  normal:[
   {title:'弓箭手村',src:'/audio/normal-01.mp3'},
   {title:'魔法森林',src:'/audio/normal-02.mp3'},
   {title:'魔法森林郊外',src:'/audio/normal-03.mp3'},
   {title:'弓箭手村市集',src:'/audio/normal-04.mp3'},
   {title:'耶雷弗',src:'/audio/normal-05.mp3'},
   {title:'耶雷弗訓練場',src:'/audio/normal-06.mp3'},
   {title:'水之都',src:'/audio/normal-07.mp3'},
   {title:'玩具城',src:'/audio/normal-08.mp3'},
   {title:'天空之城',src:'/audio/normal-09.mp3'},
   {title:'神木村',src:'/audio/normal-10.mp3'}
  ],
  tense:[
   {title:'炎魔祭壇',src:'/audio/tense-01.mp3'},
   {title:'希拉之塔',src:'/audio/tense-02.mp3'},
   {title:'阿卡伊農祭壇',src:'/audio/tense-03.mp3'},
   {title:'西格諾斯殿堂',src:'/audio/tense-04.mp3'},
   {title:'皮卡啾祭壇',src:'/audio/tense-05.mp3'}
  ]
};
 function create(random=Math.random){let mode='normal',normalIndex=0,bossIndex=-1,bag=[];
 function draw(){if(!bag.length){bag=tracks.tense.map((_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag.at(-1)===bossIndex&&bag.length>1)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}bossIndex=bag.pop();}
 function current(){return tracks[mode][mode==='normal'?normalIndex:bossIndex];}
 return {current,get mode(){return mode;},setMode(next){if(next!=='normal'&&next!=='tense')throw Error('Unknown music mode');if(mode===next)return false;mode=next;if(mode==='tense')draw();return true;},next(){if(mode==='normal')normalIndex=(normalIndex+1)%tracks.normal.length;else draw();return current();}};
 }
 return {tracks,create};
});
