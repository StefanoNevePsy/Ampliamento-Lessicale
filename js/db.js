// === DB MANAGER ===
const DB_NAME = 'StimolatoreLessicaleDB';
const DB_VERSION = 4; // Bumped for tags index
const STORE_SETS = 'sets';
const STORE_PATIENTS = 'patients';

class DB {
    static async open() {
        return new Promise((res, rej) => {
            const r = indexedDB.open(DB_NAME, DB_VERSION);
            r.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_SETS)) db.createObjectStore(STORE_SETS, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORE_PATIENTS)) db.createObjectStore(STORE_PATIENTS, { keyPath: 'id' });
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
}
