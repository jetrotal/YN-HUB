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

// Usage:
const gameStats = {
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