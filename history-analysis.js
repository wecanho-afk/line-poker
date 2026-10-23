const { Worker, isMainThread, parentPort } = require('node:worker_threads');

if (!isMainThread) {
    const strategy = require('./poker-strategy');
    parentPort.on('message', ({ id, contexts }) => {
        try {
            parentPort.postMessage({ id, advice: contexts.map(context => strategy.analyze(context)) });
        } catch (error) {
            parentPort.postMessage({ id, error: error.message || String(error) });
        }
    });
} else {
    let worker = null, sequence = 0;
    const jobs = new Map();
    function startWorker() {
        if (worker) return worker;
        const instance = new Worker(__filename);
        worker = instance;
        const fail = error => {
            if (worker !== instance) return;
            worker = null;
            for (const job of jobs.values()) job.reject(error);
            jobs.clear();
        };
        instance.on('message', message => {
            const job = jobs.get(message.id);
            if (!job) return;
            jobs.delete(message.id);
            if (message.error) job.reject(new Error(message.error));
            else job.resolve(message.advice);
            if (!jobs.size) instance.unref();
        });
        instance.on('error', fail);
        instance.on('exit', code => fail(new Error(`Hand analysis worker exited (${code})`)));
        instance.unref();
        return instance;
    }
    function analyze(contexts) {
        return new Promise((resolve, reject) => {
            let instance;
            try { instance = startWorker(); }
            catch (error) { reject(error); return; }
            const id = ++sequence;
            jobs.set(id, { resolve, reject });
            instance.ref();
            try { instance.postMessage({ id, contexts }); }
            catch (error) {
                jobs.delete(id);
                if (!jobs.size) instance.unref();
                reject(error);
            }
        });
    }
    module.exports = { analyze };
}
