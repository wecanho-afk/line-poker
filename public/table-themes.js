/* Personal table colours are stored only in this browser. */
(() => {
  const themes=[
    ['emerald','經典翡翠','沉穩綠氈與香檳金飾邊'],
    ['sapphire','深海藍','海軍藍桌氈與冷銀飾邊'],
    ['burgundy','勃根地紅','酒紅桌氈與暖銅飾邊'],
    ['amethyst','皇家紫','深紫桌氈與淡紫金屬邊'],
    ['charcoal','黑曜灰','石墨桌氈與霧金飾邊'],
    ['crimson','賭場紅','經典紅氈與亮金飾邊'],
    ['teal','湖水青','藍綠桌氈與冰銀飾邊'],
    ['olive','雪茄橄欖','橄欖綠氈與古銅飾邊']
  ];
  const button=document.createElement('button');button.id='table-theme-toggle';button.type='button';button.textContent='◆ 桌色';button.setAttribute('aria-haspopup','dialog');
  document.getElementById('voice-toggle').before(button);
  const dialog=document.createElement('dialog');dialog.id='table-theme-dialog';dialog.setAttribute('aria-labelledby','table-theme-title');
  dialog.innerHTML='<div class="table-theme-heading"><div><span>PRIVATE TABLE</span><h2 id="table-theme-title">選擇牌桌顏色</h2></div><button type="button" class="table-theme-close" aria-label="關閉牌桌顏色">✕</button></div><p>只改變你畫面中的桌氈與飾邊，其他玩家可以使用自己的配色。</p><div class="table-theme-options"></div><p class="table-theme-selection" role="status"></p>';
  document.body.append(dialog);
  let selected='emerald';
  try {const saved=localStorage.getItem('poker-table-theme');if(themes.some(([id])=>id===saved))selected=saved;}catch{}
  const options=dialog.querySelector('.table-theme-options');
  function select(id){
    selected=id;document.body.dataset.tableTheme=id;
    options.querySelectorAll('button').forEach(choice=>choice.setAttribute('aria-pressed',String(choice.dataset.tableTheme===id)));
    const name=themes.find(([key])=>key===id)[1];button.title='牌桌顏色：'+name;
    dialog.querySelector('.table-theme-selection').textContent='已套用：'+name;
    try{localStorage.setItem('poker-table-theme',id);}catch{}
  }
  for(const [id,name,detail] of themes){
    const choice=document.createElement('button');choice.type='button';choice.className='table-theme-option';choice.dataset.tableTheme=id;
    choice.innerHTML='<span class="table-theme-swatch" aria-hidden="true"><i></i><b>W</b></span><strong>'+name+'</strong><small>'+detail+'</small>';
    choice.onclick=()=>select(id);options.append(choice);
  }
  select(selected);button.onclick=()=>dialog.showModal();dialog.querySelector('.table-theme-close').onclick=()=>dialog.close();
})();
