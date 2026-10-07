/* Track references from the user-provided music catalog; audio is not copied. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PokerMusicPlaylist=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const tracks={
  "normal": [
    {
      "title": "Floral Life",
      "videoId": "s2_MAplvHeQ"
    },
    {
      "title": "Above the Treetops",
      "videoId": "F6LIFBVhObQ"
    },
    {
      "title": "When the Morning Comes",
      "videoId": "gfgBDs8z6WE"
    },
    {
      "title": "Missing You",
      "videoId": "2NoF8PHQJqQ"
    },
    {
      "title": "Moonlight Shadow",
      "videoId": "XYtHWyrVm30"
    },
    {
      "title": "Fantastic Thinking",
      "videoId": "49AZqVhXVeU"
    },
    {
      "title": "Aquarium",
      "videoId": "qtw0sIBLjrw"
    },
    {
      "title": "Ariant",
      "videoId": "w1RgDSoOajw"
    },
    {
      "title": "Queen's Garden",
      "videoId": "3r9s43TG9yA"
    },
    {
      "title": "Raindrop Flower",
      "videoId": "DhUdOO9UNwY"
    }
  ],
  "tense": [
    {
      "title": "Final Fight",
      "videoId": "rEtDrkAYs68"
    },
    {
      "title": "Time Attack",
      "videoId": "AiaV9gA3i10"
    },
    {
      "title": "Horntail",
      "videoId": "WnLrTMmnyBc"
    },
    {
      "title": "Gravity Lord Rise",
      "videoId": "zhZ5IpkghWw"
    },
    {
      "title": "Corrupted Blood",
      "videoId": "do6QC9kkmv4"
    }
  ]
};
 function create(random=Math.random){let mode='normal',normalIndex=0,bossIndex=-1,bag=[];
 function draw(){if(!bag.length){bag=tracks.tense.map((_,i)=>i);for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}if(bag.at(-1)===bossIndex&&bag.length>1)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}bossIndex=bag.pop();}
 function current(){return tracks[mode][mode==='normal'?normalIndex:bossIndex];}
 return {current,get mode(){return mode;},setMode(next){if(next!=='normal'&&next!=='tense')throw Error('Unknown music mode');if(mode===next)return false;mode=next;if(mode==='tense')draw();return true;},next(){if(mode==='normal')normalIndex=(normalIndex+1)%tracks.normal.length;else draw();return current();}};
 }
 return {tracks,create};
});
