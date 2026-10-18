import { describe, expect, it } from 'vitest';
import { fileMetadataFromProcessedImages } from './processedFileMetadata';

describe('fileMetadataFromProcessedImages', () => {
  it('counts only processed pages, in the order they were retained', () => {
    const metadata = fileMetadataFromProcessedImages(
      ['/api/upload/image/fileA/0', '/api/upload/image/fileB/0'],
      [
        { documentId: 'fileA', label: 'invoice.png' },
        { documentId: 'fileB', label: 'receipt.png' },
      ]
    );

    expect(metadata).toEqual([
      { fileId: 'fileA', fileName: 'invoice.png', pageCount: 1 },
      { fileId: 'fileB', fileName: 'receipt.png', pageCount: 1 },
    ]);
  });

  it('returns null when a url is not a processed guest image', () => {
    expect(fileMetadataFromProcessedImages(['http://localhost/plain.png'], [])).toBeNull();
  });
});
