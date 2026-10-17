const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');

test('pot shortcuts submit immediately without focusing the numeric keyboard',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const quick=html.match(/async function setQuickBet[\s\S]*?\n        }/)?.[0]||'';
 assert.match(quick,/await performAction\('raise', amount\)/);
 assert.match(quick,/fraction === 'allin'.*performAction\('call'\)/);
 assert.match(quick,/\.blur\(\)/);
 assert.doesNotMatch(quick,/\.focus\(\)/);
});

test('each state update restores fold availability after a pending action',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.doesNotMatch(html,/querySelectorAll\('button'\)\.forEach\(button => button\.disabled = true\)/);
 assert.match(html,/button\[onclick=\\"performAction\('fold'\)\\"\][\s\S]*?disabled = actionUnavailable/);
 assert.match(html,/controls\?\.setAttribute\('aria-busy', 'true'\)/);
});

test('card themes expose the six approved distinct designs and the reaction client is loaded',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const themes=fs.readFileSync(path.join(__dirname,'../public/card-themes.js'),'utf8');
 const art=fs.readFileSync(path.join(__dirname,'../public/card-face-art.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/card-themes.css'),'utf8');
 assert.match(html,/table-reactions\.js/);assert.match(html,/table-reactions\.css/);
 assert.match(html,/class="card-art"/);
 for(const name of ['經典大字','歐式宮廷','黑金賭場','四色大花','午夜幾何','酒紅雕版']) assert.match(themes,new RegExp(name));
 assert.doesNotMatch(themes,/深海藍圖|薄荷清新/);
 assert.equal((themes.match(/^\s*\['[^\n]+$/gm)||[]).length,6);
 assert.match(css,/\[data-card-theme\] \{ --card-paper:#fff/);
 assert.match(css,/Picker isolation/);
 assert.match(css,/data-card-theme="four-color"[\s\S]*?background:#c62b45/);
 for(const design of ['face-art-royal','face-art-casino','face-art-midnight','face-art-burgundy']) assert.match(art,new RegExp(design));
 assert.match(art,/renderCardFaceArt/);assert.doesNotMatch(art,/>[JQK][<]/);
 assert.match(css,/data-card-theme="burgundy"[\s\S]*?face-art-burgundy/);
 assert.match(css,/data-card-theme="midnight"[\s\S]*?face-art-midnight/);
});

test('good-hand celebration stays compact and above the action area',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/poker-premium.css'),'utf8');
 const rule=css.match(/#hand-celebration \{[^}]+\}/)?.[0]||'';
 assert.match(rule,/top:16%/);assert.match(rule,/max-width:46%/);assert.match(rule,/min-width:150px/);
 assert.doesNotMatch(rule,/top:49%|min-width:210px/);
 assert.match(css,/#hand-celebration>strong \{[^}]*font:600 18px/);
});

test('players can choose and persist eight distinct table colours',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const themes=fs.readFileSync(path.join(__dirname,'../public/table-themes.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/table-themes.css'),'utf8');
 assert.match(html,/table-themes\.css/);assert.match(html,/table-themes\.js/);
 for(const name of ['經典翡翠','深海藍','勃根地紅','皇家紫','黑曜灰','賭場紅','湖水青','雪茄橄欖'])assert.match(themes,new RegExp(name));
 assert.equal((themes.match(/^\s*\['[a-z-]+','/gm)||[]).length,8);
 assert.match(themes,/localStorage\.setItem\('poker-table-theme'/);assert.match(themes,/document\.body\.dataset\.tableTheme/);
 for(const id of ['emerald','sapphire','burgundy','amethyst','charcoal','crimson','teal','olive'])assert.match(css,new RegExp(`data-table-theme="${id}"`));
 assert.match(css,/radial-gradient\(ellipse at 48% 35%,var\(--felt-light\)/);
});

test('table reactions remain visible for four seconds in both script and animation',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../public/table-reactions.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/table-reactions.css'),'utf8');
 assert.match(script,/STICKER_VISIBLE_MS=4000/);assert.match(script,/reaction\.remove\(\),STICKER_VISIBLE_MS/);
 assert.match(css,/animation:sticker-pop 4s/);assert.doesNotMatch(css,/sticker-pop 2\.8s/);
});

test('the game sound toggle controls the local settled-pot chip cue',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const pro=fs.readFileSync(path.join(__dirname,'../public/poker-pro.js'),'utf8');
 assert.match(html,/src="\/pot-sound\.js"/);assert.match(html,/PokerPotSound\?\.setEnabled\(gameVoiceEnabled\)/);
 assert.match(html,/function showGame\(\) \{\s*lastActionCount = -1;\s*window\.PokerPotSound\?\.enter\(gameId\)/);
 assert.match(html,/utterance\.volume = \.85/);assert.match(html,/PokerAudioMix\?\.duck/);
 assert.match(pro,/PokerPotSound\?\.leave\(\);lastActionCount=-1/);
});
