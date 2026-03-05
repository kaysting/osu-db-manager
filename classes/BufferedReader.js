/**
 * Written by Gemini.
 *
 * Perform random access or sequential reads on a file, caching contents in a buffer for quick reading without ever loading the entire file into memory.
 */
class BufferedReader {
    constructor(fileHandle, bufferSize = 64 * 1024) {
        this.fileHandle = fileHandle;
        this.bufferSize = bufferSize;
        this.buffer = Buffer.allocUnsafe(bufferSize);

        // Tracking the window in memory
        this.windowStart = -1;
        this.windowEnd = -1;

        // The current global file offset (acts like a stream cursor)
        this.offset = 0;
    }

    /**
     * Manually jump the cursor to a specific point in the file.
     */
    seek(newOffset) {
        this.offset = newOffset;
    }

    /**
     * Reads the specified length from the file.
     * If `position` is omitted, it reads sequentially from the current offset.
     */
    async read(length, position = this.offset) {
        // Sync our internal cursor to the requested position
        this.offset = position;

        if (length === 0) return Buffer.alloc(0);

        // --- FALLBACK: Direct Read for Large Requests ---
        // If the request is bigger than our buffer, bypass the window entirely.
        // This prevents allocating a massive internal window that ruins memory stability.
        if (length > this.bufferSize) {
            const directBuffer = Buffer.allocUnsafe(length);
            const { bytesRead } = await this.fileHandle.read(directBuffer, 0, length, this.offset);

            this.offset += bytesRead; // Auto-advance the cursor

            // If we hit EOF during a large read, only return what we actually got
            return directBuffer.subarray(0, bytesRead);
        }

        // --- CACHE HIT CHECK ---
        const isWithinWindow = this.offset >= this.windowStart && this.offset < this.windowEnd;
        const windowHitEOF = this.windowEnd - this.windowStart < this.bufferSize;
        const requestFitsInWindow = this.offset + length <= this.windowEnd;

        if (isWithinWindow && (requestFitsInWindow || windowHitEOF)) {
            const localOffset = this.offset - this.windowStart;

            // Calculate how much we can actually return (handles EOF scenarios gracefully)
            const availableLength = Math.min(length, this.windowEnd - this.offset);

            this.offset += availableLength; // Auto-advance the cursor

            return this.buffer.subarray(localOffset, localOffset + availableLength);
        }

        // --- CACHE MISS: Refresh the Window ---
        this.windowStart = this.offset;

        const { bytesRead } = await this.fileHandle.read(this.buffer, 0, this.bufferSize, this.windowStart);

        this.windowEnd = this.windowStart + bytesRead;

        // Grab what we can from the newly populated window
        const availableLength = Math.min(length, bytesRead);
        this.offset += availableLength; // Auto-advance the cursor

        return this.buffer.subarray(0, availableLength);
    }
}

module.exports = BufferedReader;
