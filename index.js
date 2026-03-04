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
const fsp = require('fs/promises');
const ticksToDate = require('ticks-to-date');

const log = (...args) => {
    if (!process.env.ODBM_VERBOSE) return;
    console.log(`[odbm]`, ...args);
};

class StableDatabaseReader {
    constructor(fileHandle, offset = 0, bufferSize = 64 * 1024) {
        this.fileHandle = fileHandle;
        this.buffer = Buffer.alloc(bufferSize);
        this.bufferSize = bufferSize;

        // Where we are in the file globally
        this.filePointer = offset;

        // Current window state
        this.bufferStart = 0; // Start offset of the buffer in the file
        this.bufferEnd = 0; // End offset of the buffer in the file
        this.cursor = 0; // Current read position relative to this.buffer
        this.bytesInBuffer = 0;
    }

    async _readBytes(length) {
        // 1. If the request is larger than our buffer size, that's a problem.
        // (This shouldn't happen with 64KB chunks unless you're reading a huge string)
        if (length > this.bufferSize) {
            throw new Error(`Read length ${length} exceeds buffer size ${this.bufferSize}`);
        }

        // 2. Do we have enough data in the current buffer?
        if (this.cursor + length > this.bytesInBuffer) {
            await this._refillBuffer();
        }

        // 3. Slice and return
        const data = this.buffer.subarray(this.cursor, this.cursor + length);
        this.cursor += length;
        return data;
    }

    async _refillBuffer() {
        // 1. Calculate what is left over from the previous read
        const remainingLength = this.bytesInBuffer - this.cursor;

        // 2. If there's leftover data, copy it to the start of the buffer
        if (remainingLength > 0) {
            this.buffer.copy(this.buffer, 0, this.cursor, this.bytesInBuffer);
        }

        // 3. Read new data directly after the leftover data
        const { bytesRead } = await this.fileHandle.read(
            this.buffer,
            remainingLength, // Write into the buffer AFTER the leftovers
            this.bufferSize - remainingLength, // Fill the rest of the buffer
            this.filePointer // Read from where we left off
        );

        // 4. Reset state
        this.bytesInBuffer = remainingLength + bytesRead;
        this.cursor = 0;
        this.filePointer += bytesRead;
    }

    async seek(offset) {
        this.filePointer = offset;
        this.bufferEnd = 0;
        this.cursor = 0;
    }

    get offset() {
        return this.filePointer - (this.bytesInBuffer - this.cursor);
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
                `Invalid presence byte while reading string at position ${this.filePointer}: Expected 0x00 or 0x0b but found 0x${presence.toString(16)}`
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
                `Invalid bytes surrounding int-float pair at position ${this.filePointer}: Expected 0x08 ... 0x0c but found 0x${b1.toString(16)} ... 0x${b2.toString(16)}`
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
                `Invalid bytes surrounding int-float pair at position ${this.filePointer}: Expected 0x08 ... 0x0c but found 0x${b1.toString(16)} ... 0x${b2.toString(16)}`
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
}

class StableCollectionsDatabase {
    constructor(filePath) {
        this.filePath = filePath;
    }
}

class StableGameDatabase {
    /**
     * **Please use `StableGameDatabase.open()` instead of this constructor.**
     */
    constructor(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File doesn't exist: ${filePath}`);
        }
        this.filePath = filePath;
        this.data = {};
        this.beatmapIds = new Set();
        this.beatmapsetIds = new Set();
        this.beatmapIndex = [];
        log(`Initialized StableGameDatabase at ${filePath}`);
    }

    /**
     * Open an osu!standard `osu!.db` database for reading, indexing it in memory to speed up beatmap access. This may take several seconds for large databases.
     * @param {string} filePath Your database file path.
     */
    static async open(filePath) {
        const instance = new StableGameDatabase(filePath);
        instance.fileHandle = await fsp.open(filePath, 'r');
        await instance._index();
        return instance;
    }

    _getReader(offset = 0, bufferSize) {
        return new StableDatabaseReader(this.fileHandle, offset, bufferSize);
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

    async _index() {
        log(`Indexing beatmaps in ${this.filePath}...`);
        // We're using a very large buffer size here since we know we're
        // reading the whole file
        const reader = this._getReader(0, 1024 * 1024 * 10);

        this.data.version = await reader.readInt();
        this.data.folderCount = await reader.readInt();
        this.data.isAccountUnlocked = await reader.readBoolean();
        this.data.dateUnlocked = await reader.readDateTime();
        this.data.playerName = await reader.readString();
        this.data.beatmapCount = await reader.readInt();

        for (let i = 0; i < this.data.beatmapCount; i++) {
            const offset = reader.offset;
            const beatmap = await this._readBeatmap(reader);
            this.beatmapIndex.push({
                offset,
                md5: beatmap.md5,
                beatmapId: beatmap.beatmapId
            });
            this.beatmapIds.add(beatmap.beatmapId);
            this.beatmapsetIds.add(beatmap.beatmapsetId);
        }

        this.data.userPermissions = await reader.readInt();

        log(
            `Opened and indexed stable osu database version ${this.data.version} at ${this.filePath} with ${this.data.beatmapCount} beatmaps`
        );

        return this;
    }

    async _getBeatmapAtOffset(offset) {
        const reader = this._getReader(offset);
        const beatmap = await this._readBeatmap(reader);
        return beatmap;
    }

    async getBeatmapByHash(md5) {
        const entry = this.beatmapIndex.find(e => e.md5 == md5);
        if (!entry) return null;
        return this._getBeatmapAtOffset(entry.offset);
    }

    async getBeatmapById(id) {
        const entry = this.beatmapIndex.find(e => e.beatmapId == id);
        if (!entry) return null;
        return this._getBeatmapAtOffset(entry.offset);
    }

    async getBeatmaps(offset = 0, limit) {
        limit = limit || this.data.beatmapCount - offset;
        const cache = this.beatmapIndex[offset];
        if (!cache) return [];
        const reader = this._getReader(cache.offset);
        const beatmaps = [];
        let i = 0;
        while (i < limit) {
            beatmaps.push(await this._readBeatmap(reader));
            i++;
        }
        return beatmaps;
    }

    /**
     * Dump the entire database as an object. This reads the entire file into memory, so proceed with caution. Consider accessing the `data` property and using the paginated `getBeatmaps()` method when working with large databases.
     * @returns Database contents.
     */
    async dump() {
        const obj = this.data;
        obj.beatmaps = await this.getBeatmaps();
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
