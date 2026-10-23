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
                const sorted = PokerReviewMerge(request.result.map(r=>r.review),reviews.filter(r=>r?.id&&Array.isArray(r.hand)&&Array.isArray(r.actions)));
                const retained = new Set(sorted.map(review=>review.id));
                sorted.forEach(review=>store.put({owner,id:review.id,review}));
                request.result.filter(record=>!retained.has(record.id)).forEach(record=>store.delete([owner,record.id]));
            };
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('無法寫入瀏覽器儲存空間'));
        });
    }
    return {read,save};
})();
