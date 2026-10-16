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
 assert.match(css,/data-card-theme="four-color"[\s\S]*?background:#c62b45/);
 for(const design of ['face-art-royal','face-art-casino','face-art-midnight','face-art-burgundy']) assert.match(art,new RegExp(design));
 assert.match(art,/renderCardFaceArt/);assert.doesNotMatch(art,/>[JQK][<]/);
 assert.match(css,/data-card-theme="burgundy"[\s\S]*?face-art-burgundy/);
 assert.match(css,/data-card-theme="midnight"[\s\S]*?face-art-midnight/);
});
