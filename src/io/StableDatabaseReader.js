const BufferedReader = require('./BufferedReader');
const ticksToDate = require('ticks-to-date');
const { log } = require('../../lib/utils');

class StableDatabaseReader extends BufferedReader {
    constructor(fileHandle, bufferSize) {
        super(fileHandle, bufferSize);
    }

    async readByte() {
        const buf = await this.read(1);
        return buf.readUInt8(0);
    }

    async readShort() {
        const buf = await this.read(2);
        return buf.readUInt16LE(0);
    }

    async readInt() {
        const buf = await this.read(4);
        return buf.readUInt32LE(0);
    }

    async readLong() {
        const buf = await this.read(8);
        return buf.readBigUInt64LE(0);
    }

    async readSingle() {
        const buf = await this.read(4);
        return buf.readFloatLE(0);
    }

    async readDouble() {
        const buf = await this.read(8);
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

        const stringBuffer = await this.read(stringLength);
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

module.exports = StableDatabaseReader;
