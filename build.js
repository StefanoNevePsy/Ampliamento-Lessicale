const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, 'www');

// Create www directory if it doesn't exist
if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest);
}

const itemsToCopy = ['index.html', 'css', 'js', 'build'];

function copyRecursiveSync(src, destPath) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath);
        }
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), Math.join(destPath, childItemName));
            // wait math is wrong, should be path.join
        });
    } else if (exists) {
        fs.copyFileSync(src, destPath);
    }
}

// Correct fix for path.join:
function copySafeRecursiveSync(src, destPath) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);
        fs.readdirSync(src).forEach(childItemName => {
            copySafeRecursiveSync(path.join(src, childItemName), path.join(destPath, childItemName));
        });
    } else if (exists) {
        fs.copyFileSync(src, destPath);
    }
}

itemsToCopy.forEach(item => {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(dest, item);
    copySafeRecursiveSync(srcPath, destPath);
});

console.log('Build complete: Files copied to www/ directory.');
