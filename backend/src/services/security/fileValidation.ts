/**
 * Checks whether a file's actual contents match a supported file type.
 *
 * We do not rely only on the MIME type supplied during upload because
 * information supplied by the client can be spoofed.
 */
export function hasValidFileSignature(
    buffer: Uint8Array,
    mimetype: string
): boolean {
    if (buffer.length < 12) {
        return false;
    }

    switch (mimetype) {
        case 'image/jpeg':
            return (
                buffer[0] === 0xff &&
                buffer[1] === 0xd8 &&
                buffer[2] === 0xff
            );

        case 'image/png':
            return (
                buffer[0] === 0x89 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x4e &&
                buffer[3] === 0x47
            );

        case 'image/tiff':
            return (
                (
                    buffer[0] === 0x49 &&
                    buffer[1] === 0x49 &&
                    buffer[2] === 0x2a &&
                    buffer[3] === 0x00
                ) ||
                (
                    buffer[0] === 0x4d &&
                    buffer[1] === 0x4d &&
                    buffer[2] === 0x00 &&
                    buffer[3] === 0x2a
                )
            );

        case 'image/webp':
            return (
                buffer[0] === 0x52 &&
                buffer[1] === 0x49 &&
                buffer[2] === 0x46 &&
                buffer[3] === 0x46 &&
                buffer[8] === 0x57 &&
                buffer[9] === 0x45 &&
                buffer[10] === 0x42 &&
                buffer[11] === 0x50
            );

        case 'image/heic':
        case 'image/heif': {
            const boxType = String.fromCharCode(
                buffer[4],
                buffer[5],
                buffer[6],
                buffer[7]
            );

            const brand = String.fromCharCode(
                buffer[8],
                buffer[9],
                buffer[10],
                buffer[11]
            );

            const allowedBrands = [
                'heic',
                'heix',
                'hevc',
                'hevx',
                'mif1',
                'msf1'
            ];

            return boxType === 'ftyp' && allowedBrands.includes(brand);
        }

        default:
            return false;
    }
}