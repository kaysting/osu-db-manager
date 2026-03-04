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

const fs = require('fs');
const ticksToDate = require('ticks-to-date');

const log = (...args) => {
    if (!process.env.ODBM_VERBOSE) return;
    console.log(`[odbm]`, ...args);
};

class StableDatabaseReader {
    constructor(filePath, range = {}) {
        this.fileName = filePath;
        this.stream = fs.createReadStream(filePath, range);
        this.offset = range.start || 0;
        log(`Initialized StableDatabaseReader for ${filePath} with range`, range);
    }

    async _readBytes(size) {
        if (size === 0) return Buffer.alloc(0);

        return new Promise((resolve, reject) => {
            const chunk = this.stream.read(size);
            if (chunk !== null) {
                this.offset += chunk.length;
                return resolve(chunk);
            }

            const onReadable = () => {
                const chunk = this.stream.read(size);
                if (chunk !== null) {
                    this.stream.removeListener('readable', onReadable);
                    this.stream.removeListener('error', onError);
                    this.offset += chunk.length;
                    resolve(chunk);
                }
            };

            const onError = err => {
                this.stream.removeListener('readable', onReadable);
                this.stream.removeListener('error', onError);
                reject(err);
            };

            this.stream.on('readable', onReadable);
            this.stream.on('error', onError);
        });
    }

    async readByte() {
        const buf = await this._readBytes(1);
        return buf.readUInt8(0);
    }

    async readShort() {
        const buf = await this._readBytes(2);
        return buf.readUInt16LE(0);
    }

    async readInt() {
        const buf = await this._readBytes(4);
        return buf.readUInt32LE(0);
    }

    async readLong() {
        const buf = await this._readBytes(8);
        return buf.readBigUInt64LE(0);
    }

    async readSingle() {
        const buf = await this._readBytes(4);
        return buf.readFloatLE(0);
    }

    async readDouble() {
        const buf = await this._readBytes(8);
        return buf.readDoubleLE(0);
    }

    async readBoolean() {
        const byte = await this.readByte();
        return byte !== 0x00;
    }

    async readULEB128() {
        let result = 0;
        let shift = 0;

        while (true) {
            // Grab the next byte
            const byte = await this.readByte();

            // Use 0x7f (127) to mask out the MSB and keep only the 7 bits of data
            // We use (2 ** shift) instead of standard bitwise shift (<<) to prevent
            // JavaScript from aggressively wrapping into negative 32-bit signed integers.
            result += (byte & 0x7f) * 2 ** shift;

            // Use 0x80 (128) to check the MSB. If it's 0, we've reached the end of the number.
            if ((byte & 0x80) === 0) {
                break;
            }

            // Prepare to shift the next 7 bits of data higher up
            shift += 7;
        }

        return result;
    }

    async readString() {
        const presence = await this.readByte();
        if (presence === 0x00) return '';
        if (presence !== 0x0b)
            throw new Error(
                `Invalid presence byte while reading string at position ${this.offset}: Expected 0x00 or 0x0b but found 0x${presence.toString(16)}`
            );

        const stringLength = await this.readULEB128();
        if (stringLength === 0) return '';

        const stringBuffer = await this._readBytes(stringLength);
        return stringBuffer.toString('utf8');
    }

    async readIntFloatPair() {
        const b1 = await this.readByte();
        const int = await this.readInt();
        const b2 = await this.readByte();
        const float = await this.readSingle();
        if (b1 !== 0x08 || b2 !== 0x0c) {
            throw new Error(
                `Invalid bytes surrounding int-float pair at position ${this.offset}: Expected 0x08 ... 0x0c but found 0x${b1.toString(16)} ... 0x${b2.toString(16)}`
            );
        }
        return [int, float];
    }

    async readIntDoublePair() {
        const b1 = await this.readByte();
        const int = await this.readInt();
        const b2 = await this.readByte();
        const double = await this.readDouble();
        if (b1 !== 0x08 || b2 !== 0x0c) {
            throw new Error(
                `Invalid bytes surrounding int-float pair at position ${this.offset}: Expected 0x08 ... 0x0c but found 0x${b1.toString(16)} ... 0x${b2.toString(16)}`
            );
        }
        return [int, double];
    }

    async readTimingPoint() {
        const bpm = await this.readDouble();
        const offsetMs = await this.readDouble();
        const isInherited = !(await this.readBoolean());
        return { bpm, offsetMs, isInherited };
    }

    async readDateTime() {
        const ticks = await this.readLong();
        if (ticks === 0n) return null;
        return ticksToDate(Number(ticks));
    }

    close() {
        this.stream.destroy;
    }
}

class StableCollectionsDatabase {
    constructor(filePath) {
        this.filePath = filePath;
    }
}

class StableGameDatabase {
    filePath;
    data = {};
    isIndexed = false;

    /**
     * Please use the `open()` method instead of this constructor.
     */
    constructor(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File doesn't exist: ${filePath}`);
        }
        this.filePath = filePath;
        log(`Initialized StableGameDatabase at ${filePath}`);
    }

    /**
     * Index the database to speed up beatmap pagination.
     */
    async _index() {
        const reader = new StableDatabaseReader(this.filePath);

        this.data.version = await reader.readInt();
        this.data.folderCount = await reader.readInt();
        this.data.isAccountUnlocked = await reader.readBoolean();
        this.data.dateUnlocked = await reader.readDateTime();
        this.data.playerName = await reader.readString();
        this.data.beatmapCount = await reader.readInt();

        this.beatmapOffsets = [];
        for (let i = 0; i < this.data.beatmapCount; i++) {
            const offset = reader.offset;
            const beatmap = await this._readBeatmap(reader);
            this.beatmapOffsets.push({
                offset,
                md5: beatmap.md5
            });
            log(
                `Indexed beatmap ${i + 1}/${this.data.beatmapCount}: ${beatmap.beatmapId}: ${beatmap.artist} - ${beatmap.title} [${beatmap.version}]`
            );
        }

        this.data.userPermissions = await reader.readInt();
        reader.close();

        log(
            `Opened and indexed stable osu database version ${this.data.version} at ${this.filePath} with ${this.data.beatmapCount} beatmaps`
        );
    }

    /**
     * Open an osu!standard `osu!.db` database for reading.
     * @param {string} filePath Your database file path.
     */
    static async open(filePath) {
        const instance = new StableGameDatabase(filePath);
        await instance._index();
        return instance;
    }

    async _readBeatmap(reader) {
        const map = {};

        if (this.data.version < 20191106) {
            map.size = await reader.readInt();
        }

        map.artist = await reader.readString();
        map.artistUnicode = await reader.readString();
        map.title = await reader.readString();
        map.titleUnicode = await reader.readString();
        map.mapper = await reader.readString();
        map.version = await reader.readString();
        map.audioFileName = await reader.readString();
        map.md5 = await reader.readString();
        map.osuFileName = await reader.readString();

        map.rankedStatus = await reader.readByte();

        map.countCircles = await reader.readShort();
        map.countSliders = await reader.readShort();
        map.countSpinners = await reader.readShort();

        map.lastModified = await reader.readDateTime();

        if (this.data.version < 20140609) {
            map.ar = await reader.readByte();
            map.cs = await reader.readByte();
            map.hp = await reader.readByte();
            map.od = await reader.readByte();
        } else {
            map.ar = await reader.readSingle();
            map.cs = await reader.readSingle();
            map.hp = await reader.readSingle();
            map.od = await reader.readSingle();
        }

        map.sliderVelocity = await reader.readDouble();

        if (this.data.version >= 20140609) {
            map.starRatings = {};
            for (const mode of ['osu', 'taiko', 'catch', 'mania']) {
                const starRatings = [];
                const count = await reader.readInt();
                for (let k = 0; k < count; k++) {
                    let pair;
                    if (this.data.version < 20250107) {
                        pair = await reader.readIntDoublePair();
                    } else {
                        pair = await reader.readIntFloatPair();
                    }
                    const [mod, stars] = pair;
                    starRatings.push({ mod, stars });
                }
                map.starRatings[mode] = starRatings;
            }
        }

        map.drainTimeSecs = await reader.readInt();
        map.totalTimeMs = await reader.readInt();
        map.previewPointOffsetMs = await reader.readInt();

        map.timingPointCount = await reader.readInt();
        map.timingPoints = [];
        for (let i = 0; i < map.timingPointCount; i++) {
            map.timingPoints.push(await reader.readTimingPoint());
        }

        map.beatmapId = await reader.readInt();
        map.beatmapsetId = await reader.readInt();
        map.threadId = await reader.readInt();

        map.grade = {};
        for (const mode of ['osu', 'taiko', 'catch', 'mania']) {
            map.grade[mode] = await reader.readByte();
        }

        map.localOffset = await reader.readShort();
        map.stackLeniency = await reader.readSingle();
        map.mode = await reader.readByte();

        map.source = await reader.readString();
        map.tags = await reader.readString();

        map.onlineOffset = await reader.readShort();

        map.titleFont = await reader.readString();

        map.isUnplayed = await reader.readBoolean();
        map.dateLastPlayed = await reader.readDateTime();

        map.isOsuV2 = await reader.readBoolean();

        map.folderName = await reader.readString();

        map.dateLastSynced = await reader.readDateTime();

        map.areHitsoundsIgnored = await reader.readBoolean();
        map.areSkinsIgnored = await reader.readBoolean();
        map.isStoryboardDisabled = await reader.readBoolean();
        map.isVideoDisabled = await reader.readBoolean();
        map.areVisualsOverridden = await reader.readBoolean();

        if (this.data.version < 20140609) await reader.readShort();
        await reader.readInt();

        map.maniaScrollSpeed = await reader.readByte();

        return map;
    }

    /**
     * Get the complete contents of the database as an object.
     * @returns Database contents.
     */
    async dump() {
        const reader = new StableDatabaseReader(this.filePath);
        const obj = this.data;

        reader.close();
        return obj;
    }
}

class StableScoresDatabase {
    constructor(filePath) {
        this.filePath = filePath;
    }
}

module.exports = {
    StableDatabaseReader,
    StableCollectionsDatabase,
    StableGameDatabase,
    StableScoresDatabase
};
