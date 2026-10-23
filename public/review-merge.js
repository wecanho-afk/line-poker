/* Completed analysis must win over an older pending network or cache snapshot. */
(function(root){
  const priority=review=>review.analysis_status==='pending'?0:review.analysis_status==='failed'?1:2;
  function merge(...groups){
    const records=new Map();
    for(const review of groups.flat()){
      if(!review?.id)continue;
      const previous=records.get(review.id);
      if(!previous||priority(review)>=priority(previous))records.set(review.id,review);
    }
    return [...records.values()].sort((a,b)=>b.started.localeCompare(a.started)).slice(0,500);
  }
  if(typeof module==='object'&&module.exports)module.exports=merge;
  else root.PokerReviewMerge=merge;
})(typeof globalThis!=='undefined'?globalThis:this);
