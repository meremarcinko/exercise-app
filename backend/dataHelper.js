const fs = require('fs'); //Node's built in file systme tool; lets computer read and write files on computer
const path = require('path'); //a built in helper for building file path correctly (so it works on every type of computer)

/* opens a JSON file, reads its raw text, and converts it into a usable JavaScript array/object */
function readData(filename) {
    const filePath = path.join(__dirname, 'data', filename);
    const rawData = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(rawData);
}

/* takes JavaScript data and converts it back into JSON text with stringify, then saves it to the file. The null, 2 part just makes the saved file nicely formatted/indented instead of one long line */
 function writeData(filename, data) {
    const filePath = path.join(__dirname, 'data', filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
 }

 /* this makes these two functions available to other files, like the server file, so they can use them by importing this file */
 module.exports = { readData, writeData };