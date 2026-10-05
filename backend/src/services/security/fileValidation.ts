/**
 * Checks whether a file's actual contents match a supported file type.
 *
 * Do not rely only on the MIME type supplied during upload — the client
 * can spoof that label. These "magic bytes" are the real file signature.
 */
export const INVALID_FILE_CONTENTS_ERROR = 'Invalid or mismatched file contents detected.';

/** Projects store every page as page-N.png. Only mint R2 PUT URLs for this type. */
export const ALLOWED_R2_UPLOAD_CONTENT_TYPES = ['image/png'] as const;

export const UNSUPPORTED_FILE_TYPE_ERROR = 'Unsupported file type.';

export function isAllowedR2UploadContentType(contentType: string): boolean {
  return (ALLOWED_R2_UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function hasValidFileSignature(buffer: Uint8Array, mimetype: string): boolean {
  if (buffer.length < 12) {
    return false;
  }

  switch (mimetype) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case 'image/png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

    case 'image/tiff':
      return (
        (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
        (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
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
      const boxType = String.fromCharCode(buffer[4], buffer[5], buffer[6], buffer[7]);
      const brand = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
      const allowedBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];
      return boxType === 'ftyp' && allowedBrands.includes(brand);
    }

    default:
      return false;
  }
}
