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
    if (buffer.length < 4) {
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

        default:
            return false;
    }
}