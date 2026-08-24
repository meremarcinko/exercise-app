const fs = require('fs');
const path = require('path');

// Write queue — prevents concurrent writes from overwriting each other
const writeQueues = {};

function readData(filename) {
    const filePath = path.join(__dirname, 'data', filename);
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.log(`Data file corrupted: ${filename}. Restore from backup.`);
            throw new Error(`Data file ${filename} is corrupted.`);
        }
        throw error;
    }
}

function writeData(filename, data) {
    if (!writeQueues[filename]) {
        writeQueues[filename] = Promise.resolve();
    }

    writeQueues[filename] = writeQueues[filename].then(() => {
        const filePath = path.join(__dirname, 'data', filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    });

    return writeQueues[filename];
}

module.exports = { readData, writeData };