// Device-local durable reviews, partitioned by the current browser account.
window.HandCache = (() => {
    let opening;
    function open() {
        if (opening) return opening;
        opening = new Promise((resolve,reject) => {
            const request = indexedDB.open('w-poker-hand-reviews', 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore('hands', { keyPath: ['owner','id'] });
                store.createIndex('owner', 'owner', { unique:false });
            };
            request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening=null; }; resolve(request.result); };
            request.onerror = () => { opening=null; reject(request.error); };
        });
        return opening;
    }
    async function read(owner) {
        const db = await open();
        return new Promise((resolve,reject) => {
            const request = db.transaction('hands').objectStore('hands').index('owner').getAll(owner);
            request.onsuccess = () => resolve(request.result.map(r=>r.review).sort((a,b)=>b.started.localeCompare(a.started)));
            request.onerror = () => reject(request.error);
        });
    }
    async function save(owner, reviews) {
        const db = await open();
        return new Promise((resolve,reject) => {
            const tx = db.transaction('hands', 'readwrite'), store = tx.objectStore('hands');
            const request = store.index('owner').getAll(owner);
            request.onsuccess = () => {
                const byId = new Map(request.result.map(r=>[r.id,r.review]));
                reviews.forEach(r=>{if(r?.id && Array.isArray(r.hand) && Array.isArray(r.actions))byId.set(r.id,r);});
                const sorted = [...byId.values()].sort((a,b)=>b.started.localeCompare(a.started));
                sorted.slice(0,100).forEach(review=>store.put({owner,id:review.id,review}));
                sorted.slice(100).forEach(review=>store.delete([owner,review.id]));
            };
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('無法寫入瀏覽器儲存空間'));
        });
    }
    return {read,save};
})();
