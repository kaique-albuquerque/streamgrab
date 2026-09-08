// Script to generate a simple .ico file for Windows builds
import fs from 'node:fs';
import path from 'node:path';

// Create a simple 32x32 ICO file with a solid color (blue)
const width = 32;
const height = 32;
const pixels = new Uint8Array(width * height * 4);

// Fill with a nice blue color (RGBA)
for (let i = 0; i < width * height; i++) {
  pixels[i * 4] = 59;     // R
  pixels[i * 4 + 1] = 130; // G
  pixels[i * 4 + 2] = 246; // B
  pixels[i * 4 + 3] = 255; // A
}

// ICO file format
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type: ICO
icoHeader.writeUInt16LE(1, 4); // Number of images

const icoDirEntry = Buffer.alloc(16);
icoDirEntry.writeUInt8(width, 0); // Width
icoDirEntry.writeUInt8(height, 1); // Height
icoDirEntry.writeUInt8(0, 2); // Color count
icoDirEntry.writeUInt8(0, 3); // Reserved
icoDirEntry.writeUInt16LE(1, 4); // Color planes
icoDirEntry.writeUInt16LE(32, 6); // Bits per pixel

// BMP info header
const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0); // Header size
bmpHeader.writeInt32LE(width, 4); // Width
bmpHeader.writeInt32LE(height * 2, 8); // Height (doubled for ICO)
bmpHeader.writeUInt16LE(1, 12); // Planes
bmpHeader.writeUInt16LE(32, 14); // Bits per pixel
bmpHeader.writeUInt32LE(0, 16); // Compression
bmpHeader.writeUInt32LE(width * height * 4, 20); // Image size
bmpHeader.writeInt32LE(0, 24); // X pixels per meter
bmpHeader.writeInt32LE(0, 28); // Y pixels per meter
bmpHeader.writeUInt32LE(0, 32); // Colors used
bmpHeader.writeUInt32LE(0, 36); // Important colors

// Convert RGBA to BGRA (Windows format)
const bgraPixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const srcIdx = (y * width + x) * 4;
    const dstIdx = ((height - 1 - y) * width + x) * 4;
    bgraPixels[dstIdx] = pixels[srcIdx + 2]; // B
    bgraPixels[dstIdx + 1] = pixels[srcIdx + 1]; // G
    bgraPixels[dstIdx + 2] = pixels[srcIdx]; // R
    bgraPixels[dstIdx + 3] = pixels[srcIdx + 3]; // A
  }
}

const imageData = Buffer.concat([bmpHeader, bgraPixels]);
const dataOffset = 6 + 16; // Header + DirEntry
icoDirEntry.writeUInt32LE(imageData.length, 8); // Image size
icoDirEntry.writeUInt32LE(dataOffset, 12); // Offset

const icoFile = Buffer.concat([icoHeader, icoDirEntry, imageData]);

const outputPath = path.join(process.cwd(), 'build', 'icon.ico');
fs.writeFileSync(outputPath, icoFile);
console.log(`Icon created: ${outputPath} (${icoFile.length} bytes)`);
