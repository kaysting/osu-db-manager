/**
 * @typedef {Object} CollectionData
 * @property {string} name The name of the collection.
 * @property {string[]} beatmapHashes An array of beatmap md5 hashes corresponding to the maps in this collection.
 */

module.exports = class Collection {
    #name;
    #beatmapHashesSet;

    /**
     * Create a Collection.
     * @param {CollectionData} entry The stable collection entry.
     */
    constructor(entry) {
        this.#name = entry.name;
        this.#beatmapHashesSet = new Set(entry.beatmapHashes);
    }

    get name() {
        return this.#name;
    }

    /**
     * Get hashes of beatmaps in the collection, optionally paginated.
     * @param {number} limit Get this many hashes and then stop.
     * @param {number} offset Skip this many hashes before getting results.
     * @returns {string[]} An array of beatmap md5 hashes.
     */
    getBeatmapHashes(limit = Infinity, offset = 0) {
        return Array.from(this.#beatmapHashesSet).slice(offset, offset + limit);
    }

    /**
     * Rename the collection.
     * @param {string} name The new name
     * @returns {this}
     */
    rename(name) {
        this.#name = name;
        return this;
    }

    /**
     * Add a map to the collection.
     * @param {string} beatmapHash The hash of the map to add.
     * @returns {this}
     */
    addMap(beatmapHash) {
        this.#beatmapHashesSet.add(beatmapHash);
        return this;
    }

    /**
     * Remove a map from the collection.
     * @param {string} beatmapHash The hash of the map to remove.
     * @returns {this}
     */
    removeMap(beatmapHash) {
        this.#beatmapHashesSet.delete(beatmapHash);
        return this;
    }
};
