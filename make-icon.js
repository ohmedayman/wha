const fs = require('fs');
const path = require('path');

function create256IcoFile() {
    const width = 256;
    const height = 256;
    const bpp = 32;
    const imageSize = width * height * 4; // 262144 bytes
    const headerSize = 40; // BITMAPINFOHEADER
    const andMaskSize = (width * height) / 8; // 8192 bytes
    const totalImageDataSize = headerSize + imageSize + andMaskSize;
    const offset = 22; // 6 (ICONDIR) + 16 (ICONDIRENTRY)

    const buffer = Buffer.alloc(offset + totalImageDataSize);

    // ICONDIR
    buffer.writeUInt16LE(0, 0); // Reserved
    buffer.writeUInt16LE(1, 2); // ICO Type (1 = icon)
    buffer.writeUInt16LE(1, 4); // 1 Image

    // ICONDIRENTRY (256x256 is encoded as 0, 0 in width and height)
    buffer.writeUInt8(0, 6); // Width = 256 (0)
    buffer.writeUInt8(0, 7); // Height = 256 (0)
    buffer.writeUInt8(0, 8); // Colors (0 = 256+)
    buffer.writeUInt8(0, 9); // Reserved
    buffer.writeUInt16LE(1, 10); // Color planes
    buffer.writeUInt16LE(bpp, 12); // Bits per pixel
    buffer.writeUInt32LE(totalImageDataSize, 14); // Image size
    buffer.writeUInt32LE(offset, 18); // Offset

    // BITMAPINFOHEADER
    let ptr = offset;
    buffer.writeUInt32LE(40, ptr); ptr += 4; // biSize
    buffer.writeInt32LE(width, ptr); ptr += 4; // biWidth
    buffer.writeInt32LE(height * 2, ptr); ptr += 4; // biHeight (doubled for mask)
    buffer.writeUInt16LE(1, ptr); ptr += 2; // biPlanes
    buffer.writeUInt16LE(bpp, ptr); ptr += 2; // biBitCount
    buffer.writeUInt32LE(0, ptr); ptr += 4; // biCompression (BI_RGB)
    buffer.writeUInt32LE(imageSize, ptr); ptr += 4; // biSizeImage
    buffer.writeInt32LE(0, ptr); ptr += 4; // biXPelsPerMeter
    buffer.writeInt32LE(0, ptr); ptr += 4; // biYPelsPerMeter
    buffer.writeUInt32LE(0, ptr); ptr += 4; // biClrUsed
    buffer.writeUInt32LE(0, ptr); ptr += 4; // biClrImportant

    // Draw high quality 256x256 WhatsApp Green Icon
    const cx = width / 2;
    const cy = height / 2;
    const radius = 115;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius) {
                if (dist > 95 && dist <= radius) {
                    // Outer dark border (#075e54)
                    buffer.writeUInt8(84, ptr);     // B
                    buffer.writeUInt8(94, ptr + 1); // G
                    buffer.writeUInt8(7, ptr + 2);  // R
                    buffer.writeUInt8(255, ptr + 3);// A
                } else if (dist <= 45 && dist >= 35) {
                    // White inner circle ring
                    buffer.writeUInt8(255, ptr);
                    buffer.writeUInt8(255, ptr + 1);
                    buffer.writeUInt8(255, ptr + 2);
                    buffer.writeUInt8(255, ptr + 3);
                } else {
                    // WhatsApp Brand Green (#25d366)
                    buffer.writeUInt8(102, ptr);    // B
                    buffer.writeUInt8(211, ptr + 1);// G
                    buffer.writeUInt8(37, ptr + 2); // R
                    buffer.writeUInt8(255, ptr + 3);// A
                }
            } else {
                // Transparent
                buffer.writeUInt8(0, ptr);
                buffer.writeUInt8(0, ptr + 1);
                buffer.writeUInt8(0, ptr + 2);
                buffer.writeUInt8(0, ptr + 3);
            }
            ptr += 4;
        }
    }

    // AND Mask (0 for opaque)
    buffer.fill(0, ptr, ptr + andMaskSize);

    const targetPath = path.join(__dirname, 'icon.ico');
    fs.writeFileSync(targetPath, buffer);
    console.log(`✅ تم إنشاء ملف icon.ico بدقة 256x256 بنجاح (${buffer.length} بايت).`);
}

create256IcoFile();
