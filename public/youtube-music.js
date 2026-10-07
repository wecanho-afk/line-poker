/* YouTube remains visible while playing. No extraction, hidden players or audio copies. */
window.PokerYouTubeMusic={create(button){
 const queue=PokerMusicPlaylist.create();let player=null,ready=false,enabled=false,loadedId='',normalTime=0,normalId='',resumeOnVisible=false,loadPromise=null,watchdog=null,visible=false;
 const shell=document.createElement('section');shell.id='music-player-panel';shell.hidden=true;shell.setAttribute('aria-label','配樂播放器');
 shell.innerHTML='<div class="music-player-frame"><div id="youtube-music-player"></div></div><div class="music-player-footer"><span id="music-player-status" role="status">載入播放器…</span><button type="button" id="music-next" aria-label="下一首配樂">下一首</button></div><small class="music-privacy">播放即連線 YouTube · <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">隱私權</a></small>';
 const status=shell.querySelector('#music-player-status'),nextButton=shell.querySelector('#music-next');
 const rail=document.querySelector('.action-rail'),scroll=document.createElement('div');scroll.className='action-scroll';while(rail.firstChild)scroll.append(rail.firstChild);rail.append(scroll);
 function place(){if(!enabled)return;const table=document.body.classList.contains('playing');const target=table?rail:document.querySelector('.container');if(shell.parentElement!==target)target.prepend(shell);document.body.classList.toggle('music-open',table);}
 const observer=new MutationObserver(place);observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 function message(text){status.textContent=text;}
 function pause(){clearTimeout(watchdog);if(ready)player.pauseVideo();}
 function blocked(text='請點影片內的 ▶ 播放'){message(text);button.textContent='♫ 配樂待播放 · 關閉';button.setAttribute('aria-pressed','false');}
 function watch(){clearTimeout(watchdog);watchdog=setTimeout(()=>{if(enabled&&ready&&player.getPlayerState()!==1)blocked();},8000);}
 function playCurrent(cueOnly=false){if(!ready||!enabled)return;const track=queue.current();const start=queue.mode==='normal'&&track.videoId===normalId?normalTime:0;
   loadedId=track.videoId;message(cueOnly?'請點影片內的 ▶ 播放':'配樂載入中…');
   if(cueOnly||document.hidden||!visible){player.cueVideoById({videoId:loadedId,startSeconds:start});return;}
   player.loadVideoById({videoId:loadedId,startSeconds:start});watch();
 }
 function api(){if(window.YT?.Player)return Promise.resolve();if(loadPromise)return loadPromise;loadPromise=new Promise((resolve,reject)=>{const old=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{if(old)old();resolve();};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>reject(Error('network'));document.head.append(script);setTimeout(()=>{if(!window.YT?.Player)reject(Error('timeout'));},15000);}).catch(e=>{loadPromise=null;throw e;});return loadPromise;}
 function changed(event){if(!enabled)return;if(event.data===1){if(document.hidden||!visible){pause();return;}clearTimeout(watchdog);button.textContent=queue.mode==='tense'?'♫ 緊張配樂 · 關閉':'♫ 一般配樂 · 關閉';button.setAttribute('aria-pressed','true');message(queue.mode==='tense'?'緊張配樂':'一般配樂');}
   else if(event.data===0){queue.next();playCurrent();}
   else if(event.data===2){button.setAttribute('aria-pressed','false');message('已暫停 · 點影片 ▶ 繼續');}
 }
 async function open(){enabled=true;shell.hidden=false;place();button.textContent='♫ 載入配樂 · 關閉';
  try{await api();if(!enabled)return;if(player){if(ready){if(loadedId!==queue.current().videoId)playCurrent();else{player.playVideo();watch();}}return;}
   player=new YT.Player('youtube-music-player',{width:'100%',height:'200',host:'https://www.youtube-nocookie.com',videoId:queue.current().videoId,playerVars:{playsinline:1,autoplay:0,controls:1,origin:location.origin,rel:0},events:{onReady:()=>{ready=true;if(!enabled)return;player.setVolume(40);playCurrent(true);blocked();},onStateChange:changed,onAutoplayBlocked:()=>blocked(),onError:()=>{clearTimeout(watchdog);blocked('此曲無法播放，請按下一首');}}});
  }catch{blocked('播放器載入失敗 · 關閉後重試');}
 }
 function close(){enabled=false;resumeOnVisible=false;pause();shell.hidden=true;document.body.classList.remove('music-open');button.textContent='♫ 開啟配樂';button.setAttribute('aria-pressed','false');}
 button.onclick=()=>{if(enabled)close();else open();};nextButton.onclick=()=>{queue.next();if(queue.mode==='normal'){normalId='';normalTime=0;}playCurrent();};
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].intersectionRatio>=.95;if(!visible){resumeOnVisible=resumeOnVisible||(ready&&player.getPlayerState()===1);pause();}else if(enabled&&ready&&resumeOnVisible&&!document.hidden){resumeOnVisible=false;player.playVideo();watch();}},{threshold:[0,.95,1]});intersection.observe(shell.querySelector('.music-player-frame'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){resumeOnVisible=resumeOnVisible||(ready&&player.getPlayerState()===1);pause();}else if(enabled&&ready&&visible&&resumeOnVisible){resumeOnVisible=false;player.playVideo();watch();}});
 window.addEventListener('pagehide',pause);
 return {setMode(mode){if(mode===queue.mode)return;if(queue.mode==='normal'&&ready){normalTime=player.getCurrentTime()||0;normalId=loadedId;}queue.setMode(mode);button.dataset.mode=mode;if(enabled)playCurrent();}};
}};
