const fs = require('fs');
const fsp = require('fs/promises');
const StableDatabaseReader = require('../io/StableDatabaseReader');
const { log } = require('../../lib/utils');

module.exports = class StableCollectionsDatabase {
    /**
     * Please use `StableCollectionsDatabase.open()` instead of this constructor.
     */
    constructor(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File doesn't exist: ${filePath}`);
        }
        this.filePath = filePath;
        this.data = {
            version: 0,
            countCollections: 0,
            collections: []
        };
        log(`Initialized StableCollectionsDatabase at ${filePath}`);
    }

    /**
     * Open an osu!standard `collections.db` database, indexing it in memory to speed up queries. This may take several seconds for large databases.
     * @param {string} filePath Your database file path.
     */
    static async open(filePath) {
        const instance = new StableCollectionsDatabase(filePath);
        instance.fileHandle = await fsp.open(filePath, 'r');
        await instance._index();
        return instance;
    }

    close() {
        this.fileHandle.close();
    }

    _getReader(offset = 0, bufferSize) {
        const reader = new StableDatabaseReader(this.fileHandle, bufferSize);
        reader.seek(offset);
        return reader;
    }

    async _index() {
        const reader = this._getReader();

        // Get basic data
        this.data.version = await reader.readInt();
        this.data.countCollections = await reader.readInt();

        // Loop for each collection
        let totalMapCount = 0;
        for (let i = 0; i < this.data.countCollections; i++) {
            // Get collection metadata
            const data = {};
            data.offset = reader.offset;
            data.index = i;
            data.name = await reader.readString();
            data.countBeatmaps = await reader.readInt();
            data.beatmapHashes = [];

            // Loop for each map in the collection
            for (let j = 0; j < data.countBeatmaps; j++) {
                const md5 = await reader.readString();
                data.beatmapHashes.push(md5);
                totalMapCount++;
            }

            // Save to index
            this.data.collections.push(data);
        }

        log(
            `Opened and read ${this.data.collections.length} collections containing ${totalMapCount} beatmap entries from ${this.filePath}`
        );

        return this;
    }

    getCollectionByIndex(i) {
        const collection = this.data.collections[i];
        delete collection.beatmaps;
        return collection;
    }

    getCollectionsByName(nameSubstring) {
        for (const collection of this.data.collections) {
            if (collection.name.includes(nameSubstring)) {
                log(`Found collection at index ${collection.index} with name containing ${nameSubstring}`);
                return collection;
            }
        }
    }
};
