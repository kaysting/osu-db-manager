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

class StableDatabaseReader {
    constructor(filePath, range = {}) {
        this.fileName = filePath;
        this.stream = fs.createReadStream(filePath, range);
        this.offset = range.start || 0;
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

    async readIntFloatPair() {}

    async readIntDoublePair() {}

    async readTimingPoint() {}

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
    constructor(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File doesn't exist: ${filePath}`);
        }
        this.filePath = filePath;
    }

    async toJSON() {
        const reader = new StableDatabaseReader(this.filePath);
        const obj = {};

        obj.gameVersion = await reader.readInt();
        obj.folderCount = await reader.readInt();
        obj.isAccountUnlocked = await reader.readBoolean();
        obj.dateUnlocked = await reader.readDateTime();
        obj.playerName = await reader.readString();
        obj.beatmapCount = await reader.readInt();

        obj.beatmaps = [];
        for (let i = 0; i < obj.beatmapCount; i++) {
            const map = {};
            if (obj.gameVersion < 20191106) {
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
            if (obj.gameVersion < 20140609) {
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

            console.log(map);

            obj.beatmaps.push(map);
        }

        obj.userPermissions = await reader.readInt();

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
