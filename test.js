const fs = require('fs');
const api = require('./src');

process.env.ODBM_VERBOSE = true;
const stableOsuPath = './.samples/noemi-osu!.db';
const stableCollectionsPath = './.samples/nikku-collection.db';

const tests = [
    // Stable osu!.db tests
    {
        name: 'Open osu!.db',
        f: async () => {
            const db = await api.StableGameDatabase.open(stableOsuPath);
            return db;
        }
    },
    {
        name: 'Read paginated map list from osu!.db',
        requires: ['Open osu!.db'],
        f: async db => {
            const count = 20;
            const maps = await db.getBeatmaps(0, count);
            if (!maps || maps.length !== count) {
                throw new Error(`No maps or invalid amount of maps returned.`);
            }
            db.close();
        }
    },

    // Stable collections.db tests
    {
        name: 'Open collections.db',
        f: async () => {
            const db = await api.StableCollectionsDatabase.open(stableCollectionsPath);
            return db;
        }
    },
    {
        name: 'List collections in collections.db',
        requires: ['Open collections.db'],
        f: async db => {
            if (!db.collections || db.collections.length == 0) {
                throw new Error(`No collections read`);
            }
            return db;
        }
    },
    {
        name: 'Read a collection',
        requires: ['Open collections.db'],
        f: async db => {
            const index = 4;
            const collection = db.collections[index];
            if (!collection) throw new Error(`Collection at index ${index} doesn't exist`);
            return db;
        }
    },
    {
        name: 'Add a new collection',
        requires: ['Open collections.db'],
        f: async db => {
            // Steal some maps from a few other collections
            const hashes = [...db.collections[1].getBeatmapHashes(0, 5), db.collections[3].getBeatmapHashes(2, 4)];
            const collection = db.createCollection('meow meow meow', hashes);
            return db;
        }
    },
    {
        name: 'Write altered collections.db and read to verify changes',
        requires: ['Open collections.db'],
        f: async db => {
            const newPath = './test-collections.db';
            await db.writeChanges(newPath);

            const newDb = await api.StableCollectionsDatabase.open(newPath);
            const collection = newDb.getCollectionByName('meow meow meow');
            if (!collection) throw new Error(`New collection not found :(`);
            fs.rmSync(newPath);
        }
    }
];

require('./lib/tester')(tests);
