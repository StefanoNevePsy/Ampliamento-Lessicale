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
    // Sets
    static async getAllSets() {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_SETS, 'readonly').objectStore(STORE_SETS).getAll();
            tx.onsuccess = () => r(tx.result || []);
        });
    }
    static async saveSet(set) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_SETS, 'readwrite').objectStore(STORE_SETS).put(set);
            tx.onsuccess = () => r(true);
        });
    }
    static async deleteSet(id) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_SETS, 'readwrite').objectStore(STORE_SETS).delete(id);
            tx.onsuccess = () => r(true);
        });
    }
    // Patients
    static async getAllPatients() {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_PATIENTS, 'readonly').objectStore(STORE_PATIENTS).getAll();
            tx.onsuccess = () => r(tx.result || []);
        });
    }
    static async savePatient(p) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_PATIENTS, 'readwrite').objectStore(STORE_PATIENTS).put(p);
            tx.onsuccess = () => r(true);
        });
    }
    static async deletePatient(id) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_PATIENTS, 'readwrite').objectStore(STORE_PATIENTS).delete(id);
            tx.onsuccess = () => r(true);
        });
    }
    // Tag Images (IndexedDB - no localStorage limit)
    static async getAllTagImages() {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_TAG_IMAGES, 'readonly').objectStore(STORE_TAG_IMAGES).getAll();
            tx.onsuccess = () => {
                const map = {};
                (tx.result || []).forEach(rec => { map[rec.tag] = rec.dataUrl; });
                r(map);
            };
        });
    }
    static async saveTagImage(tag, dataUrl) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_TAG_IMAGES, 'readwrite').objectStore(STORE_TAG_IMAGES).put({ tag, dataUrl });
            tx.onsuccess = () => r(true);
        });
    }
    static async deleteTagImage(tag) {
        const db = await DB.open();
        return new Promise(r => {
            const tx = db.transaction(STORE_TAG_IMAGES, 'readwrite').objectStore(STORE_TAG_IMAGES).delete(tag);
            tx.onsuccess = () => r(true);
        });
    }
    static async importAllTagImages(map) {
        const db = await DB.open();
        const tx = db.transaction(STORE_TAG_IMAGES, 'readwrite');
        const store = tx.objectStore(STORE_TAG_IMAGES);
        for (const [tag, dataUrl] of Object.entries(map)) {
            store.put({ tag, dataUrl });
        }
        return new Promise(r => { tx.oncomplete = () => r(true); });
    }
}
