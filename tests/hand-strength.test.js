const {test}=require('node:test');const assert=require('node:assert/strict');const {describe,isPremiumStartingHand}=require('../public/hand-strength');
test('premium starting hands include JJ+ AK and suited AQ only',()=>{
 for(const hand of [['Js','Jh'],['Qs','Qd'],['Kh','Kc'],['As','Ad'],['As','Kh'],['Ah','Kd'],['As','Qs']])assert.equal(isPremiumStartingHand(hand),true,hand.join(' '));
 for(const hand of [['Ts','Th'],['As','Qh'],['Ks','Qs'],['9s','9h'],['??','??'],['As','As']])assert.equal(isPremiumStartingHand(hand),false,hand.join(' '));
});
test('personal strength identifies ranks, wheel, pairs, full houses and best five of seven',()=>{
 const cases=[
 [['As','2h'],['3c','4d','5s'],'A～5 順子'],
 [['Qs','Qh'],['Qc','5d','5s'],'Q 葫蘆（5 一對）'],
 [['5s','5h'],[],'5 一對'],
 [['Ks','Qh'],['Kc','Qd','2s'],'K、Q 兩對'],
 [['As','Ah'],['Ac','Kd','Ks','Kh','2c'],'A 葫蘆（K 一對）'],
 [['As','Ks'],['Qs','Js','Ts','2d','3c'],'皇家同花順'],
 [['2s','3s'],['4s','5s','6s','Ah','Ad'],'2～6 同花順'],
 [['Kh','Kd'],['Ks','Kc','As'],'K 鐵支'],
 [['As','8s'],['2s','4s','6s','Kd','Qh'],'A 高同花'],
 [['Qs','Qh'],['Qc','7d','2s'],'Q 三條'],
 [['As','Kh'],[],'A 高牌'],
 [['2d','3h'],['Ts','Js','Qs','Ks','As'],'皇家同花順'],
 [['Ks','Kh'],['Qs','Qh','Js','Jh','2c'],'K、Q 兩對']
 ];for(const [h,b,want]of cases)assert.equal(describe(h,b),want);
});
test('unknown, absent, duplicated or invalid cards never produce a private hint',()=>{
 for(const [h,b]of [[['??','??'],[]],[[],[]],[['As','As'],[]],[['As','Kd'],['As']],[['Xx','Kh'],[]]])assert.equal(describe(h,b),null);
});
test('500 seeded seven-card hands agree with an independent poker evaluator category',()=>{
 const {Hand}=require('pokersolver');const deck=[...'23456789TJQKA'].flatMap(r=>[...'shdc'].map(s=>r+s));let seed=781;
 const expected=['高牌','一對','兩對','三條','順子','同花','葫蘆','鐵支','同花順'];
 for(let n=0;n<500;n++){const pool=[...deck],cards=[];for(let i=0;i<7;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;cards.push(pool.splice(seed%pool.length,1)[0]);}const solved=Hand.solve(cards);const label=describe(cards.slice(0,2),cards.slice(2));assert.ok(label.includes(expected[solved.rank-1]),cards.join(' ')+' '+label+' '+solved.name);}
});
