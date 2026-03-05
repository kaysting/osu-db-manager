/**
 *
 * This project wouldn't be possible without these docs:
 * https://github.com/ppy/osu/wiki/Legacy-database-file-structure
 *
 * Gemini helped a lot here. We're taking a very object-oriented approach, which
 * is different than how I usually write my code - at least, I don't normally make classes.
 * This is a learning experience for me and also the lowest level JS I've written.
 *
 */

const StableGameDatabase = require('./databases/StableGameDatabase');
const StableCollectionsDatabase = require('./databases/StableCollectionsDatabase');
const StableScoresDatabase = require('./databases/StableScoresDatabase');

module.exports = {
    StableGameDatabase,
    StableCollectionsDatabase,
    StableScoresDatabase
};
