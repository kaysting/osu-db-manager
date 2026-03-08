const fs = require('fs');
const api = require('./src');

process.env.ODBM_VERBOSE = true;
const stableOsuPath = './.samples/valerus-osu!.db';
const stableCollectionsPath = './.samples/nikku-collection.db';
const stableScoresPath = './.samples/kuba-scores.db';
const lazerRealmPath = './.samples/meru-client.realm';

require('./lib/tester')([
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
        /** @param {api.StableGameDatabase} db */
        f: async db => {
            const count = 20;
            const maps = await db.getBeatmaps(count, 0);
            if (maps.length !== count) {
                throw new Error(`No maps or invalid amount of maps returned.`);
            }
            if (!maps[0].hash) throw new Error(`Invalid map returned!`);
            console.log(maps[0]);
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
            if (!collection.name) throw new Error(`Invalid collection returned!`);
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
            db.close();

            const newDb = await api.StableCollectionsDatabase.open(newPath);
            const collection = newDb.getCollectionByName('meow meow meow');
            if (!collection) throw new Error(`New collection not found :(`);
            newDb.close();
            fs.rmSync(newPath);
        }
    },
    {
        name: 'Open scores.db',
        f: async () => {
            const db = api.StableScoresDatabase.open(stableScoresPath);
            return db;
        }
    },
    {
        name: 'Read scores for a map in scores.db',
        requires: ['Open scores.db'],
        /** @param {api.StableScoresDatabase} db */
        f: async db => {
            const hash = db.getBeatmapHashes(1)[0];
            const scores = await db.getBeatmapScores(hash);
            if (scores.length < 1) throw new Error(`No scores returned!`);
            if (!scores[0].beatmapHash) throw new Error(`Invalid score returned`);
            return db;
        }
    },
    {
        name: 'Read paginated scores sequentially from scores.db',
        requires: ['Open scores.db'],
        /** @param {api.StableScoresDatabase} db */
        f: async db => {
            const scores = await db.getScores(10, 10);
            if (scores.length !== 10) throw new Error(`Got wrong number of scores`);
            if (!scores[0].beatmapHash) throw new Error(`Invalid score returned`);

            db.close();
        }
    },
    {
        name: 'Open lazer realm db',
        f: async () => {
            const db = await api.LazerRealmDatabase.open(lazerRealmPath);
            const schema = db.db.getSchema();
            fs.writeFileSync('.lazer-schema.json', JSON.stringify(schema, null, 2));
            return db;
        }
    },
    {
        name: 'Read maps sequentially from lazer realm',
        requires: ['Open lazer realm db'],
        /** @param {api.LazerRealmDatabase} db */
        f: async db => {
            const maps = await db.getBeatmaps(10, 50);
            if (!maps || maps.length !== 10) throw new Error(`Invalid amount of maps returned`);
            if (!maps[0].hash) throw new Error(`Invalid map data returned!`);
            return { db, hash: maps[1].hash, id: maps[3].id };
        }
    },
    {
        name: 'Read a map by hash and id from lazer realm',
        requires: ['Open lazer realm db'],
        f: async ({ db, hash, id }) => {
            const mapByHash = await db.getBeatmapByHash(hash);
            const mapById = await db.getBeatmapById(id);
            if (!mapByHash?.hash || !mapById?.hash) throw new Error(`Failed to get map(s)`);
            return db;
        }
    }
]);
