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
            if (!db.data.collections || db.data.collections.length == 0) {
                throw new Error(`No collections read`);
            }
            return db;
        }
    },
    {
        name: 'Get a collection by index from collections.db',
        requires: ['Open collections.db'],
        f: async db => {
            const collection = db.getCollectionByIndex(2);
            if (!collection) throw new Error(`Collection at index 2 doesn't exist`);
            return db;
        }
    },
    {
        name: 'Get a collection by name substring from collections.db',
        requires: ['Open collections.db'],
        f: async db => {
            const collection = db.getCollectionsByName('circle');
            if (!collection) throw new Error(`Collection with name containing circle doesn't exist`);
            db.close();
        }
    }
];

require('./lib/tester')(tests);
