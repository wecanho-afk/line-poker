/* Lightweight room reactions: the server accepts fixed sticker IDs only. */
(() => {
  const STICKER_VISIBLE_MS=4000;
  const stickers={
    nice:{emoji:'👏',label:'好牌'},wow:{emoji:'😲',label:'哇！'},gg:{emoji:'🤝',label:'GG'},laugh:{emoji:'😂',label:'笑死'},
    cheer:{emoji:'🔥',label:'漂亮'},thanks:{emoji:'🙏',label:'謝啦'},coffee:{emoji:'☕',label:'想一下'},fish:{emoji:'🐟',label:'上鉤了'}
  };
  const button=document.createElement('button');button.id='sticker-toggle';button.type='button';button.className='btn-blue';button.textContent='☺ 互動貼圖';button.setAttribute('aria-haspopup','dialog');
  document.querySelector('.table-tools').prepend(button);
  const dialog=document.createElement('dialog');dialog.id='sticker-dialog';dialog.setAttribute('aria-labelledby','sticker-title');
  dialog.innerHTML='<div class="sticker-heading"><div><span>TABLE REACTIONS</span><h2 id="sticker-title">傳送互動貼圖</h2></div><button type="button" class="sticker-close" aria-label="關閉貼圖">✕</button></div><div class="sticker-grid"></div><p id="sticker-status" role="status">同桌玩家都會看到貼圖。</p>';
  document.body.append(dialog);
  const grid=dialog.querySelector('.sticker-grid'),status=dialog.querySelector('#sticker-status');
  for(const [id,item] of Object.entries(stickers)){
    const choice=document.createElement('button');choice.type='button';choice.dataset.sticker=id;choice.innerHTML=`<span>${item.emoji}</span><strong>${item.label}</strong>`;
    choice.onclick=()=>send(id);grid.append(choice);
  }
  function position(reaction){
    const table=document.getElementById('poker-table'),seat=document.querySelector(`.player-seat[data-player-id="${CSS.escape(reaction.dataset.playerId)}"]`);
    if(!seat){reaction.style.left='50%';reaction.style.top='44%';return;}
    const tableBox=table.getBoundingClientRect(),seatBox=seat.getBoundingClientRect();
    reaction.style.left=(seatBox.left-tableBox.left+seatBox.width/2)+'px';reaction.style.top=Math.max(2,seatBox.top-tableBox.top-36)+'px';
  }
  function positionActive(){document.querySelectorAll('#poker-table > .seat-sticker').forEach(position);}
  function render(data){
    const item=stickers[data?.id];if(!item||!data.user_id)return;
    const table=document.getElementById('poker-table');
    Array.from(table.children).filter(node=>node.classList.contains('seat-sticker')&&node.dataset.playerId===String(data.user_id)).forEach(node=>node.remove());
    const reaction=document.createElement('div');reaction.className='seat-sticker';reaction.dataset.playerId=String(data.user_id);reaction.setAttribute('role','status');reaction.innerHTML=`<span>${item.emoji}</span><strong>${item.label}</strong>`;
    table.append(reaction);position(reaction);setTimeout(()=>reaction.remove(),STICKER_VISIBLE_MS);
  }
  function bindSocket(){
    if(!socket||socket.__tableStickerBound)return;
    socket.__tableStickerBound=true;socket.on('table_sticker',render);
  }
  async function send(id){
    bindSocket();
    if(!socket?.connected||!gameId){status.textContent='尚未連上牌桌，請稍後再試。';return;}
    grid.querySelectorAll('button').forEach(item=>item.disabled=true);status.textContent='傳送中…';
    socket.timeout(2500).emit('table_sticker',{id},(error,result)=>{
      grid.querySelectorAll('button').forEach(item=>item.disabled=false);
      if(error||!result?.success){status.textContent=result?.message||'貼圖傳送失敗，請稍後再試。';return;}
      status.textContent='已傳送';dialog.close();
    });
  }
  const originalInit=initSocket;initSocket=function(){originalInit();bindSocket();};
  const originalUpdate=proUpdate;proUpdate=function(state){originalUpdate(state);requestAnimationFrame(positionActive);};
  window.addEventListener('resize',()=>requestAnimationFrame(positionActive));
  button.onclick=()=>{status.textContent='同桌玩家都會看到貼圖。';dialog.showModal();};dialog.querySelector('.sticker-close').onclick=()=>dialog.close();
})();
