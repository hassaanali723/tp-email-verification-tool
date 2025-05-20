const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StorageService {
    constructor() {
        // Base directory for file storage
        this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
        this.initStorage();
    }

    /**
     * Initialize storage directory
     * @private
     */
    async initStorage() {
        try {
            await fs.access(this.uploadDir);
        } catch (error) {
            // Create directory if it doesn't exist
            await fs.mkdir(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Generate a unique filename
     * @private
     * @param {string} originalName - Original file name
     * @returns {string} - Unique filename
     */
    _generateUniqueFilename(originalName) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const extension = path.extname(originalName);
        return `${timestamp}-${randomString}${extension}`;
    }

    /**
     * Save file to storage
     * @param {Buffer} fileBuffer - File data buffer
     * @param {string} originalName - Original file name
     * @param {string} userId - User ID
     * @returns {Promise<Object>} File metadata
     */
    async saveFile(fileBuffer, originalName, userId) {
        try {
            // Create user-specific directory
            const userDir = path.join(this.uploadDir, userId);
            await fs.mkdir(userDir, { recursive: true });

            const filename = this._generateUniqueFilename(originalName);
            const filePath = path.join(userDir, filename);

            // Save file
            await fs.writeFile(filePath, fileBuffer);

            // Get file stats
            const stats = await fs.stat(filePath);

            return {
                filename,
                originalName,
                path: filePath,
                size: stats.size,
                mimeType: this._getMimeType(originalName),
                userId
            };
        } catch (error) {
            throw new Error(`Error saving file: ${error.message}`);
        }
    }

    /**
     * Delete file from storage
     * @param {string} filename - Name of file to delete
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async deleteFile(filename, userId) {
        try {
            const userDir = path.join(this.uploadDir, userId);
            const filePath = path.join(userDir, filename);
            await fs.unlink(filePath);
            
            // Try to remove user directory if empty
            try {
                const files = await fs.readdir(userDir);
                if (files.length === 0) {
                    await fs.rmdir(userDir);
                }
            } catch (error) {
                // Ignore errors when trying to remove directory
                console.warn(`Could not remove user directory: ${error.message}`);
            }
        } catch (error) {
            throw new Error(`Error deleting file: ${error.message}`);
        }
    }

    /**
     * Get file from storage
     * @param {string} filename - Name of file to retrieve
     * @param {string} userId - User ID
     * @returns {Promise<Buffer>} File data
     */
    async getFile(filename, userId) {
        try {
            const filePath = path.join(this.uploadDir, userId, filename);
            return await fs.readFile(filePath);
        } catch (error) {
            throw new Error(`Error reading file: ${error.message}`);
        }
    }

    /**
     * Get mime type based on file extension
     * @private
     * @param {string} filename - File name
     * @returns {string} Mime type
     */
    _getMimeType(filename) {
        const extension = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.csv': 'text/csv',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.txt': 'text/plain'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * Check if file exists
     * @param {string} filename - Name of file to check
     * @returns {Promise<boolean>} Whether file exists
     */
    async fileExists(filename) {
        try {
            await fs.access(path.join(this.uploadDir, filename));
            return true;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
module.exports = new StorageService(); 