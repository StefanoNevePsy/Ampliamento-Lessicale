// === DB MANAGER ===
const DB_NAME = 'StimolatoreLessicaleDB';
const DB_VERSION = 5; // v5: added tagImages store
const STORE_SETS = 'sets';
const STORE_PATIENTS = 'patients';
const STORE_TAG_IMAGES = 'tagImages';

class DB {
    static async open() {
        return new Promise((res, rej) => {
            const r = indexedDB.open(DB_NAME, DB_VERSION);
            r.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_SETS)) db.createObjectStore(STORE_SETS, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORE_PATIENTS)) db.createObjectStore(STORE_PATIENTS, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORE_TAG_IMAGES)) db.createObjectStore(STORE_TAG_IMAGES, { keyPath: 'tag' });
            };
            r.onsuccess = e => res(e.target.result);
            r.onerror = e => rej(e.target.error);
        });
    }
    // Wrap an IDBRequest so failures (quota, corruption) REJECT instead of
    // hanging the awaiting import/save forever.
    static _p(request, map) {
        return new Promise((res, rej) => {
            request.onsuccess = () => res(map ? map(request.result) : request.result);
            request.onerror = () => rej(request.error || new Error('Errore IndexedDB'));
        });
    }
    // Sets
    static async getAllSets() {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_SETS, 'readonly').objectStore(STORE_SETS).getAll(), v => v || []);
    }
    static async saveSet(set) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_SETS, 'readwrite').objectStore(STORE_SETS).put(set), () => true);
    }
    static async deleteSet(id) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_SETS, 'readwrite').objectStore(STORE_SETS).delete(id), () => true);
    }
    static async getSet(id) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_SETS, 'readonly').objectStore(STORE_SETS).get(id), v => v || null);
    }
    static async getAllSetIds() {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_SETS, 'readonly').objectStore(STORE_SETS).getAllKeys(), v => v || []);
    }
    // Patients
    static async getAllPatients() {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_PATIENTS, 'readonly').objectStore(STORE_PATIENTS).getAll(), v => v || []);
    }
    static async savePatient(p) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_PATIENTS, 'readwrite').objectStore(STORE_PATIENTS).put(p), () => true);
    }
    static async deletePatient(id) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_PATIENTS, 'readwrite').objectStore(STORE_PATIENTS).delete(id), () => true);
    }
    // Tag Images (IndexedDB - no localStorage limit)
    static async getAllTagImages() {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_TAG_IMAGES, 'readonly').objectStore(STORE_TAG_IMAGES).getAll(), rows => {
            const map = {};
            (rows || []).forEach(rec => { map[rec.tag] = rec.dataUrl; });
            return map;
        });
    }
    static async saveTagImage(tag, dataUrl) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_TAG_IMAGES, 'readwrite').objectStore(STORE_TAG_IMAGES).put({ tag, dataUrl }), () => true);
    }
    static async deleteTagImage(tag) {
        const db = await DB.open();
        return DB._p(db.transaction(STORE_TAG_IMAGES, 'readwrite').objectStore(STORE_TAG_IMAGES).delete(tag), () => true);
    }
    static async importAllTagImages(map) {
        const db = await DB.open();
        const tx = db.transaction(STORE_TAG_IMAGES, 'readwrite');
        const store = tx.objectStore(STORE_TAG_IMAGES);
        for (const [tag, dataUrl] of Object.entries(map)) {
            store.put({ tag, dataUrl });
        }
        return new Promise((res, rej) => {
            tx.oncomplete = () => res(true);
            tx.onerror = () => rej(tx.error || new Error('Errore IndexedDB'));
            tx.onabort = () => rej(tx.error || new Error('Transazione annullata (quota?)'));
        });
    }
}
