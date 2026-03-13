const BufferedWriter = require('./BufferedWriter');

module.exports = class StableDatabaseWriter extends BufferedWriter {
    /**
     * @param {fs.promises.FileHandle} fileHandle The open file handle to write to.
     * @param {number} bufferSize Size in bytes before forcing a disk write (default 64KB).
     */
    constructor(fileHandle, bufferSize) {
        super(fileHandle, bufferSize);
    }

    // Writer methods written by Gemini

    async writeByte(val) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(val, 0);
        await this.write(buf);
    }

    async writeShort(val) {
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt16LE(val, 0);
        await this.write(buf);
    }

    async writeInt(val) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeUInt32LE(val, 0);
        await this.write(buf);
    }

    async writeLong(val) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeBigUInt64LE(BigInt(val), 0);
        await this.write(buf);
    }

    async writeSingle(val) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeFloatLE(val, 0);
        await this.write(buf);
    }

    async writeDouble(val) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeDoubleLE(val, 0);
        await this.write(buf);
    }

    async writeBoolean(val) {
        // Boolean is just a byte: 0x01 for true, 0x00 for false
        await this.writeByte(val ? 1 : 0);
    }

    async writeULEB128(val) {
        if (val === 0) {
            await this.writeByte(0);
            return;
        }

        let length = val;
        while (length > 0) {
            // Grab the lowest 7 bits of the number
            let byte = length & 0x7f;

            // Shift right by 7 bits (Unsigned shift '>>>' prevents negative looping)
            length >>>= 7;

            // If there's still more number left to encode, set the 8th bit (MSB) to 1
            if (length !== 0) {
                byte |= 0x80;
            }

            await this.writeByte(byte);
        }
    }

    async writeString(str) {
        // 0x00 signifies the string is empty or not present
        if (typeof str !== 'string' || str.length === 0) {
            await this.writeByte(0x00);
            return;
        }

        // 0x0b signifies a string object is present
        await this.writeByte(0x0b);

        // Convert to a buffer FIRST so we get the byte length, not the char length!
        const strBuffer = Buffer.from(str, 'utf8');

        // Write the ULEB128 length, then append the raw text bytes
        await this.writeULEB128(strBuffer.length);
        await this.write(strBuffer);
    }

    // Optional: If you ever need to write the timing points or pairs back
    async writeIntFloatPair(int, float) {
        await this.writeByte(0x08);
        await this.writeInt(int);
        await this.writeByte(0x0c);
        await this.writeSingle(float);
    }

    async writeIntDoublePair(int, double) {
        await this.writeByte(0x08);
        await this.writeInt(int);
        await this.writeByte(0x0d);
        await this.writeDouble(double);
    }
};
