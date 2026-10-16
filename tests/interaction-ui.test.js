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

test('card themes include portrait face cards and the reaction client is loaded',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const themes=fs.readFileSync(path.join(__dirname,'../public/card-themes.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/card-themes.css'),'utf8');
 assert.match(html,/table-reactions\.js/);assert.match(html,/table-reactions\.css/);
 assert.match(themes,/宮廷花牌/);assert.match(themes,/賭場大字/);
 assert.match(css,/data-rank="Q"/);assert.match(css,/content:'♛'/);
});
