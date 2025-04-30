/**
 * @typedef {Object} DirectoryItem
 * @property {string} name - Name of the file or directory
 * @property {'file'|'directory'|'unknown'} type - Type of the item
 */

/**
 * Fetches and updates player count from the game server
 * @param {string} gameId - The ID of the game
 * @returns {Promise<number>} The player count
 * @throws {Error} If the request fails or receives invalid data
 */
async function fetchAndUpdatePlayerCount(gameId) {
    const CORS_PROXY = "https://api.allorigins.win/get?url=";
    const API_URL = encodeURIComponent(`https://connect.ynoproject.net/${gameId}/api/players`);

    try {
        const response = await fetch(`${CORS_PROXY}${API_URL}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        const count = parseInt(data.contents, 10);

        if (isNaN(count)) {
            throw new Error(`Invalid player count received: ${data.contents}`);
        }


        console.log(`Player count updated: ${count}`);
        return count.toString();
    } catch (error) {
        console.error('Error fetching player count:', error);
        throw error;
    }
}

class FileSystem {
    /**
     * @param {Object} fsHandler - File system handler
     */
    constructor(fsHandler) {
        if (!fsHandler) {
            throw new Error('File system handler is required');
        }
        this.fs = fsHandler;
        this.ROOT_PATH = '';
    }

    /**
     * Lists contents of a directory
     * @param {string} path - Directory path to list
     * @returns {Promise<DirectoryItem[]>}
     */
    async listDirectory(path) {
        const normalizedPath = this.normalizePath(path);

        try {
            if (!this.fileExists(normalizedPath)) {
                throw new Error(`Directory does not exist: ${normalizedPath}`);
            }

            const contents = this.fs.readdir(normalizedPath);
            const directoryContents = await Promise.all(
                contents.map(async(item) => this.getFileInfo(normalizedPath, item))
            );

            console.log(`Contents of ${normalizedPath}:`, directoryContents);
            return directoryContents;
        } catch (error) {
            console.error(`Error listing directory ${normalizedPath}:`, error);
            throw error;
        }
    }

    /**
     * Gets information about a file or directory
     * @private
     */
    async getFileInfo(basePath, item) {
        try {
            const fullPath = `${basePath}/${item}`;
            const stat = this.fs.stat(fullPath);
            return {
                name: item,
                type: this.fs.isDir(stat.mode) ? 'directory' : 'file'
            };
        } catch (error) {
            console.warn(`Unable to determine type for ${item}:`, error);
            return { name: item, type: 'unknown' };
        }
    }

    /**
     * Reads contents of a file
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>}
     */
    async readFile(filePath) {
        const normalizedPath = this.normalizePath(filePath);

        try {
            if (!this.fileExists(normalizedPath)) {
                throw new Error(`File does not exist: ${normalizedPath}`);
            }
            return this.fs.readFile(normalizedPath, { encoding: 'utf8' });
        } catch (error) {
            console.error(`Failed to read file ${normalizedPath}:`, error);
            throw error;
        }
    }

    /**
     * Writes contents to a file
     * @param {string} filePath - Path to the file
     * @param {string} contents - Contents to write
     * @returns {Promise<void>}
     */
    async writeFile(filePath, contents) {
        const normalizedPath = this.normalizePath(filePath);

        try {
            await this.ensureDirectoryExists(normalizedPath);
            this.fs.writeFile(normalizedPath, contents, { encoding: 'utf8' });
            console.log(`File written successfully: ${normalizedPath}`);
        } catch (error) {
            console.error(`Failed to write file ${normalizedPath}:`, error);
            throw error;
        }
    }

    /**
     * Helper method to check if file exists
     * @private
     */
    fileExists(path) {
        return this.fs.analyzePath(path).exists;
    }

    /**
     * Helper method to normalize file path
     * @private
     */
    normalizePath(path) {
        if (!path.startsWith(this.ROOT_PATH)) {
            return this.ROOT_PATH + path.replace(/^\/+/, '');
        }
        return path;
    }

    /**
     * Helper method to ensure directory exists
     * @private
     */
    async ensureDirectoryExists(filePath) {
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        try {
            if (!this.fileExists(dirPath)) {
                this.fs.mkdirTree(dirPath);
            }
        } catch (error) {
            console.warn(`Directory creation attempted for ${dirPath}:`, error);
        }
    }
}

/**
 * Creates a watcher for a file and executes a callback when changes are detected
 * @param {FileSystem} fs - The FileSystem instance
 * @param {string} filePath - Path to the file to watch
 * @param {Function} callback - Function to execute when file changes
 * @param {number} pollInterval - How often to check for changes (in milliseconds)
 * @returns {Object} Watcher object with stop() method
 */
function createFileWatcher(fs, filePath, callback, pollInterval = 1000) {
    let lastContent = null;
    let isWatching = true;

    async function checkFile() {
        if (!isWatching) return;

        try {
            const currentContent = await fs.readFile(filePath);

            // If this is the first read, store the content and wait for changes
            if (lastContent === null) {
                lastContent = currentContent;
                return;
            }

            // Check if content has changed
            if (currentContent !== lastContent) {
                console.log(`File ${filePath} has changed`);
                lastContent = currentContent;
                callback(currentContent);
            }
        } catch (error) {
            console.error(`Error watching file ${filePath}:`, error);
        } finally {
            // Schedule next check if still watching
            if (isWatching) {
                setTimeout(checkFile, pollInterval);
            }
        }
    }

    // Start watching
    checkFile();

    // Return controller object
    return {
        stop: () => {
            isWatching = false;
            console.log(`Stopped watching ${filePath}`);
        },
        isWatching: () => isWatching
    };
}

async function updateAllPlayerCounts(gameStats) {
    try {
        const updatePromises = Object.keys(gameStats).map(async gameId => {
            try {
                const count = await fetchAndUpdatePlayerCount(gameId);
                gameStats[gameId] = parseInt(count);
                console.log(`Updated ${gameId}: ${count}`);
            } catch (error) {
                console.error(`Error updating ${gameId}:`, error);
            }
        });

        await Promise.all(updatePromises);

        // Log the final state
        console.log('Final gameStats:', gameStats);
        return gameStats;
    } catch (error) {
        console.error('Error updating player counts:', error);
        throw error;
    }
}

/**
 * Extracts filename and extension from a File object.
 *
 * @param {File} file - The uploaded file object.
 * @param {string} [defaultName='uploaded_file'] - The default filename if no name is found.
 * @returns {{ filename: string, extension: string }} An object containing the filename and extension.
 */
function getFileInfo(file, defaultName = 'uploaded_file') {
    let filename = defaultName;
    let extension = '';

    if (file && file.name) {
        const nameParts = file.name.split('.');
        if (nameParts.length > 1) {
            extension = nameParts.pop().toLowerCase(); // Extract extension
            filename = nameParts.join('.'); // Join remaining parts as filename
        } else {
            filename = nameParts[0]; // If no extension, use the entire name as filename
        }
    }

    return { filename, extension };
}

/**
 * Reads the content of a File object as an ArrayBuffer.
 *
 * @param {File} file - The file to read.
 * @returns {Promise<ArrayBuffer>} A promise that resolves with the ArrayBuffer data.
 * @throws {Error} If the file cannot be read or converted.
 */
async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async readEvent => {
            try {
                const base64data = readEvent.target.result;
                const base64Response = await fetch(base64data);
                const blob = await base64Response.blob();
                const buffer = await blob.arrayBuffer();
                resolve(buffer);
            } catch (error) {
                reject(new Error('Failed to convert file to ArrayBuffer: ' + error.message));
            }
        };
        reader.onerror = error => {
            reject(new Error('Failed to read file: ' + error.message));
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Saves the provided ArrayBuffer data to the specified file path using the FileSystem.
 *
 * @param {FileSystem} fs - The FileSystem instance.
 * @param {string} filePath - The full path where the file should be saved.
 * @param {ArrayBuffer} buffer - The ArrayBuffer data to save.
 * @returns {Promise<void>} A promise that resolves when the file is saved and synced.
 * @throws {Error} If there's an error during saving or syncing.
 */
async function storeFile(fs, filePath, buffer) {
    try {
        const byteArray = new Uint8Array(buffer);
        await fs.writeFile(filePath, byteArray);

        // Return a promise that resolves when sync is complete
        return new Promise((resolve, reject) => {
            if (easyrpgPlayer && easyrpgPlayer.FS) {
                easyrpgPlayer.FS.syncfs(true, (err) => {
                    if (err) {
                        console.error('Error syncing filesystem:', err);
                        reject(new Error('Failed to sync filesystem: ' + err.message));
                    } else {
                        console.log(`File saved and synced successfully to: ${filePath}`);
                        resolve();
                    }
                });
            } else {
                console.warn('easyrpgPlayer.FS not found, skipping sync');
                resolve();
            }
        });
    } catch (error) {
        console.error('Error saving file:', error);
        throw new Error('Failed to save file: ' + error.message);
    }
}

/**
 * Prompts the user to upload a file and returns the selected File object.
 *
 * @param {string} [accept='*'] - The accepted MIME types for the file input.
 * @returns {Promise<File>} A promise that resolves with the File object when selected,
 * or rejects if no file is selected or if there's an error.
 */
async function uploadFile(accept = '*') {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                resolve(file);
            } else {
                reject(new Error('No file selected'));
            }
        };
        input.click(); // Programmatically trigger the file selection dialog
    });
}

/**
 * Orchestrates the file upload and storage process with WASM filesystem sync.
 *
 * @param {FileSystem} fs - The FileSystem instance to use for storing the file.
 * @param {string} [basePath='/easyrpg/Picture'] - The base directory to store the file.
 * @param {string} [accept='*'] - The accepted file types for upload.
 * @returns {Promise<string>} A promise that resolves with the full path of the saved file.
 * @throws {Error} If there is an error during the upload, storage, or sync process.
 */
async function uploadAndStoreFile(fs, basePath = '/easyrpg/Picture', accept = '*') {
    try {
        const file = await uploadFile(accept);
        const { filename, extension } = getFileInfo(file);
        const filePath = `${basePath}/${filename}${extension ? '.' + extension : ''}`;
        const buffer = await readFileAsArrayBuffer(file);
        await storeFile(fs, filePath, buffer);
        return filePath;
    } catch (error) {
        console.error('Error in upload and store process:', error);
        throw new Error('Upload and store failed: ' + error.message);
    }
}


// Usage:
const gameStats = {
    "unconscious":0,
    "yume": 0,
    "2kki": 0,
    "flow": 0,
    "unevendream": 0,
    "deepdreams": 0,
    "prayers": 0,
    "someday": 0,
    "amillusion": 0,
    "braingirl": 0,
    "muma": 0,
    "genie": 0,
    "mikan": 0,
    "ultraviolet": 0,
    "sheawaits": 0,
    "oversomnia": 0,
    "tsushin": 0,
    "nostalgic": 0,
    "oneshot": 0,
    "if": 0,
    "unaccomplished": 0
};

/**
 * Example usage of the FileSystem and player count functionality
 */

let isInitialized = false;
let isProcessingAction = false;

async function initFS() {

    try {

        // Update all player counts
        updateAllPlayerCounts(gameStats)
            .then(updatedStats => {
                console.log('Updated stats:', updatedStats);
                // Convert the object to a JSON string before writing
                const jsonString = JSON.stringify(updatedStats, null, 2);
                fs.writeFile('/easyrpg/Save/Text/players_counter.json', jsonString);
            })
            .catch(error => {
                console.error('Failed to update stats:', error);
            });



        // Initialize current_action.txt
        await initializeCurrentAction();

    } catch (error) {
        console.error('Error in initialization:', error);
    }

    async function initializeCurrentAction() {
        try {
            // Read the file content to verify if it's empty
            let currentContent = '';
            try {
                currentContent = await fs.readFile('/easyrpg/Save/Text/current_action.txt');
            } catch (error) {
                console.warn('current_action.txt not found or unreadable, it will be initialized:', error);
            }

            // If the file is not empty, log and clear it
            if (currentContent.trim() !== '') {
                console.log('Found non-empty current_action.txt, clearing:', currentContent);
                await fs.writeFile('/easyrpg/Save/Text/current_action.txt', '');
            } else {
                console.log('current_action.txt is already empty.');
            }

            // Delay to ensure write operation completes
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('Setting up watcher...');
            // Set up file watcher with debounce
            let timeoutId = null;
            createFileWatcher(
                fs,
                '/easyrpg/Save/Text/current_action.txt',
                (newContent) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    timeoutId = setTimeout(() => {
                        handleCurrentActionChange(newContent);
                    }, 100);
                },
                500
            );

            isInitialized = true;
            console.log('Current action system initialized');

        } catch (error) {
            console.error('Error initializing current_action:', error);
        }
    }




    async function handleCurrentActionChange(newContent) {
        if (!isInitialized || isProcessingAction) {
            return;
        }

        try {
            isProcessingAction = true;

            if (newContent.startsWith('gotoURL')) {
                const url = newContent.replace('gotoURL ', '').trim();

                if (isValidUrl(url)) {
                    // Clear the file before navigation
                    await fs.writeFile('/easyrpg/Save/Text/current_action.txt', '');

                    // Navigate to URL
                    window.location.href = url;
                } else {
                    console.error('Invalid URL detected:', url);
                    await fs.writeFile('/easyrpg/Save/Text/current_action.txt', '');
                }
            } else {
                // Clear file for unrecognized commands
                await fs.writeFile('/easyrpg/Save/Text/current_action.txt', '');
            }

        } catch (error) {
            console.error('Error handling current action:', error);
        } finally {
            isProcessingAction = false;
        }
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}