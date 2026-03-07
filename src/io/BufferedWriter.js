/**
 * Written by Gemini
 *
 * Queue buffers to be written to a file, only actually writing after the queued buffers exceed a set threshold, or when `flush()` is called.
 */
module.exports = class BufferedWriter {
    /**
     * @param {fs.promises.FileHandle} fileHandle The open file handle to write to.
     * @param {number} flushThreshold Size in bytes before forcing a disk write (default 64KB).
     */
    constructor(fileHandle, flushThreshold = 64 * 1024) {
        this.fileHandle = fileHandle;
        this.flushThreshold = flushThreshold;

        this.chunks = [];
        this.currentSize = 0;

        // Tracks our global position in the physical file
        this.offset = 0;
    }

    /**
     * Queues a buffer to be written. Flushes to disk automatically if the threshold is met.
     * @param {Buffer} buffer The binary data to write.
     */
    async write(buffer) {
        if (buffer.length === 0) return;

        this.chunks.push(buffer);
        this.currentSize += buffer.length;

        // If our RAM queue gets too big, dump it to the hard drive
        if (this.currentSize >= this.flushThreshold) {
            await this.flush();
        }
    }

    /**
     * Forces all currently queued chunks to be written to the disk immediately.
     * Must be called at the very end of your file-writing process!
     */
    async flush() {
        if (this.chunks.length === 0) return;

        // Fuse the small chunks into one payload
        const payload = Buffer.concat(this.chunks);

        // Write it to the exact correct byte offset in the physical file
        await this.fileHandle.write(payload, 0, payload.length, this.offset);

        // Advance our internal cursor by the amount we just wrote
        this.offset += payload.length;

        // Clear the RAM queue
        this.chunks = [];
        this.currentSize = 0;
    }
};
