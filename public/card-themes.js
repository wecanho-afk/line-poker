/* Card preferences are personal and stay on this browser. */
(() => {
  const themes=[['classic','經典象牙','溫潤紙感・雙色花色'],['four-color','四色競技','四色辨識・清楚易讀'],['midnight','午夜黑金','深色牌面・霧金細節'],['ocean','深海藍','冷白牌面・海藍牌背'],['burgundy','酒紅典藏','奶油牌面・酒紅牌背'],['mint','薄荷清新','清亮底色・墨綠花色']];
  const button=document.createElement('button');button.id='card-theme-toggle';button.type='button';button.textContent='♠ 牌面';button.setAttribute('aria-haspopup','dialog');
  document.getElementById('voice-toggle').before(button);
  const dialog=document.createElement('dialog');dialog.id='card-theme-dialog';dialog.setAttribute('aria-labelledby','card-theme-title');
  dialog.innerHTML='<div class="theme-heading"><div><span>你的牌桌，你的風格</span><h2 id="card-theme-title">選擇紙牌風格</h2></div><button type="button" class="theme-close" aria-label="關閉紙牌風格">✕</button></div><p>即時套用到手牌、公共牌與回顧，選擇會自動儲存。</p><div class="theme-options"></div><p class="theme-selection" role="status"></p>';
  document.body.append(dialog);
  let selected='classic';
  try {const saved=localStorage.getItem('poker-card-theme');if(themes.some(([id])=>id===saved))selected=saved;}catch{}
  const options=dialog.querySelector('.theme-options');
  function select(id){
    selected=id;document.body.dataset.cardTheme=id;
    options.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cardTheme===id)));
    const name=themes.find(([key])=>key===id)[1];button.title='紙牌風格：'+name;
    dialog.querySelector('.theme-selection').textContent='已套用：'+name;
    try{localStorage.setItem('poker-card-theme',id);}catch{}
  }
  for(const [id,name,detail] of themes){
    const choice=document.createElement('button');choice.type='button';choice.className='theme-option';choice.dataset.cardTheme=id;
    choice.innerHTML='<div class="theme-sample" aria-hidden="true">'+['As','Kh','Qd','Jc'].map(c=>formatCard(c)).join('')+'<div class="card card-back">W</div></div><strong>'+name+'</strong><small>'+detail+'</small>';
    choice.onclick=()=>select(id);options.append(choice);
  }
  select(selected);button.onclick=()=>dialog.showModal();dialog.querySelector('.theme-close').onclick=()=>dialog.close();
})();
