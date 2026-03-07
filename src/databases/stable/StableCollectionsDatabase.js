const fs = require('fs');
const fsp = require('fs/promises');

const StableDatabaseReader = require('../../io/StableDatabaseReader');
const Collection = require('../../objects/Collection');
const { log } = require('../../../lib/utils');
const StableDatabaseWriter = require('../../io/StableDatabaseWriter');

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
            countCollections: 0
        };
        this.collections = [];
        log(`Initialized StableCollectionsDatabase at ${filePath}`);
    }

    /**
     * Open an osu!standard `collections.db` database, indexing it in memory to speed up queries. This may take several seconds for large databases.
     * @param {string} filePath Your database file path.
     */
    static async open(filePath) {
        const instance = new StableCollectionsDatabase(filePath);
        instance.fileHandle = await fsp.open(filePath, 'r');
        await instance.#index();
        return instance;
    }

    /**
     * Close the file handle on the open database.
     */
    close() {
        this.fileHandle.close();
    }

    async #index() {
        const reader = new StableDatabaseReader(this.fileHandle);

        // Get basic data
        this.data.version = await reader.readInt();
        this.data.countCollections = await reader.readInt();

        // Loop for each collection
        let totalMapCount = 0;
        for (let i = 0; i < this.data.countCollections; i++) {
            // Get collection metadata
            const name = await reader.readString();
            const countBeatmaps = await reader.readInt();
            const beatmapHashes = [];

            // Loop for each map in the collection
            for (let j = 0; j < countBeatmaps; j++) {
                const md5 = await reader.readString();
                beatmapHashes.push(md5);
                totalMapCount++;
            }

            // Create and save to index
            const collection = new Collection({
                name,
                beatmapHashes
            });
            this.collections.push(collection);
        }

        log(
            `Opened and read ${this.collections.length} collections containing ${totalMapCount} beatmap entries from ${this.filePath}`
        );

        return this;
    }

    /**
     * Find collections whose names contain a substring.
     * @param {string} nameSubstring Substring to search for within names.
     * @returns {Collection[]}
     */
    searchCollectionsByName(nameSubstring) {
        return this.collections.filter(c => c.name.includes(nameSubstring));
    }

    /**
     * Find collections that contain a specific map.
     * @param {string} beatmapHash A beatmap md5 hash.
     * @returns {Collection[]}
     */
    searchCollectionsByContents(beatmapHash) {
        return this.collections.filter(c => c.beatmapHashesSet.has(beatmapHash));
    }

    /**
     * Get a collection by name.
     * @param {string} name Collection name.
     * @returns {Collection|null}
     */
    getCollectionByName(name) {
        return this.collections.find(c => c.name === name) || null;
    }

    /**
     * Get a collection by its index.
     * @param {number} idx The collection index as it appears in the db.
     * @returns {Collection|null}
     */
    getCollectionByIndex(idx) {
        return this.collections[idx] || null;
    }

    /**
     * Create a collection and add it to this database to be written later.
     * @param {string} name Collection name.
     * @param {string[]} [beatmapHashes] Array of beatmap hashes, defaults to an empty array.
     * @returns {Collection}
     */
    createCollection(name = '', beatmapHashes = []) {
        name = name.trim();
        if (!name) throw new Error(`Collection must have a name!`);
        if (this.getCollectionByName(name)) throw new Error(`Collection with name ${name} already exists`);
        const collection = new Collection({ name, beatmapHashes });
        this.collections.push(collection);
        return collection;
    }

    /**
     * Delete a collection by name.
     * @param {string} name Collection name.
     */
    deleteCollectionByName(name) {
        this.collections = this.collections.filter(c => c.name !== name);
    }

    /**
     * Delete a collection by index.
     * @param {number} idx Collection index.
     */
    deleteCollectionByIndex(idx) {
        this.collections.splice(idx, 1);
    }

    /**
     * Write a new database with changes applied.
     * @param {string} outputFilePath Output the new database to this path.
     */
    async writeChanges(outputFilePath) {
        const writeHandle = await fsp.open(outputFilePath, 'w');
        const writer = new StableDatabaseWriter(writeHandle);
        log(`Opened ${outputFilePath} to write new collections.db`);

        // Write basics
        await writer.writeInt(this.data.version);
        await writer.writeInt(this.collections.length);

        // Loop for each collection
        for (const collection of this.collections) {
            // Get collection map hashes
            const hashes = collection.getBeatmapHashes();

            // Write collection meta
            await writer.writeString(collection.name);
            await writer.writeInt(hashes.length);

            // Write all the hashes
            for (const hash of hashes) {
                await writer.writeString(hash);
            }
        }

        // Flush and close
        await writer.flush();
        await writeHandle.close();
        log(`Wrote new collections.db with ${this.collections.length} collections to ${outputFilePath}`);
    }
};
