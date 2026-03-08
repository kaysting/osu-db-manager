module.exports = class BeatmapSet {
    /**
     * Create a new `BeatmapSet` object from a stable or lazer beatmap entry.
     *
     * `BeatmapSet`s contain information about a set of individual beatmaps, like song information and metadata common to all difficulties.
     * @param {Object} d Raw data.
     */
    constructor(d = {}) {
        /**
         * The online ID of this beatmapset. `0` if not submitted, `-1` in some other unknown instances even when submitted.
         *
         * Try to rely on individual beatmap IDs instead of this value.
         */
        this.id = d.beatmapsetId ?? d.BeatmapSet?.OnlineID ?? 0;

        /**
         * Song artist, exclusively Latin characters.
         * @type {string}
         */
        this.artist = d.artist ?? d.Metadata?.Artist ?? '';

        /**
         * Song artist in unicode. May contain characters from other writing systems.
         * @type {string}
         */
        this.artistUnicode = d.artistUnicode ?? d.Metadata?.ArtistUnicode ?? '';

        /**
         * Song title, exclusively Latin characters.
         * @type {string}
         */
        this.title = d.title ?? d.Metadata?.Title ?? '';

        /**
         * Song title in unicode. May contain characters from other writing systems.
         * @type {string}
         */
        this.titleUnicode = d.titleUnicode ?? d.Metadata?.TitleUnicode ?? '';

        /**
         * Song source.
         * @type {string}
         */
        this.source = d.source ?? d.Metadata?.Source ?? '';

        /**
         * Map tags.
         * @type {string}
         */
        this.tags = d.tags ?? d.Metadata?.Tags ?? '';

        /**
         * The name of the player who created this map.
         * @type {string}
         */
        this.mapperName = d.mapper ?? d.Metadata?.Author?.Username ?? '';

        /**
         * The name of the folder that contains this beatmapset's map files.
         *
         * Exclusive to stable.
         * @type {string|null}
         */
        this.folderName = d.folderName ?? null;
    }
};
