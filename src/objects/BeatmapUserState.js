module.exports = class BeatmapUserState {
    /**
     * Create a new `BeatmapUserState` object from a stable or lazer beatmap entry. This object stores user settings and played state on a beatmap.
     * @param {Object} d Raw data.
     */
    constructor(d = {}) {
        /**
         * Has the user played this map?
         * @type {boolean}
         */
        this.isPlayed =
            (d.isUnplayed !== undefined ? !d.isUnplayed : null) ??
            (d.LastPlayed !== undefined ? !!d.LastPlayed : null) ??
            d.isPlayed ??
            false;

        /**
         * Local offset.
         * @type {number}
         */
        this.offset = d.localOffset ?? d.UserSettings?.Offset ?? 0;

        /**
         * Is the user ignoring custom hitsounds on this map?
         *
         * Exclusive to stable.
         * @type {boolean}
         */
        this.areCustomHitsoundsIgnored = d.areHitsoundsIgnored ?? false;

        /**
         * Is the user ignoring custom skins on this map?
         *
         * Exclusive to stable.
         * @type {boolean}
         */
        this.areSkinsIgnored = d.areSkinsIgnored ?? false;

        /**
         * Has the user disabled storyboards?
         *
         * Exclusive to stable.
         * @type {boolean}
         */
        this.isStoryboardDisabled = d.isStoryboardDisabled ?? false;

        /**
         * Has the user disabled video?
         *
         * Exclusive to stable.
         * @type {boolean}
         */
        this.isVideoDisabled = d.isVideoDisabled ?? false;

        /**
         * Has the user overridden the visuals of this map?
         *
         * Documentation simply labels this "visual override". Unsure what it means.
         *
         * Exclusive to stable.
         * @type {boolean}
         */
        this.areVisualsOverridden = d.areVisualsOverridden ?? false;
    }
};
