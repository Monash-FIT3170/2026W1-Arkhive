import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUploadedPage, groupUploadedPages, parseMetadata } from './fileGroups.ts';

describe('parseMetadata', () => {
  it('parses an array of page metadata used by the validation file dropdown', () => {
    const metadata = parseMetadata(
      JSON.stringify([
        { type: 'Invoice', fileIndex: 0, fileName: 'invoice.pdf', pageLabel: 'Page 1' },
        { type: 'Invoice', fileIndex: 0, fileName: 'invoice.pdf', pageLabel: 'Page 2' },
      ])
    );

    assert.equal(metadata.length, 2);
    assert.equal(metadata[0].fileName, 'invoice.pdf');
    assert.equal(metadata[0].fileIndex, 0);
  });

  it('returns an empty list for invalid JSON instead of throwing', () => {
    assert.deepEqual(parseMetadata('{not json'), []);
    assert.deepEqual(parseMetadata(undefined), []);
  });
});

describe('buildUploadedPage', () => {
  it('keeps fileIndex and fileName from upload metadata', () => {
    const page = buildUploadedPage('page-0.png', 0, {
      type: 'Invoice',
      fileIndex: 2,
      fileName: 'statement.pdf',
      pageLabel: 'Page 1',
    });

    assert.equal(page.fileIndex, 2);
    assert.equal(page.fileName, 'statement.pdf');
    assert.equal(page.pageLabel, 'Page 1');
  });

  it('treats an untagged page as its own file', () => {
    const page = buildUploadedPage('page-3.png', 3, undefined);

    assert.equal(page.fileIndex, 3);
    assert.equal(page.fileName, 'Page 4');
    assert.equal(page.type, 'Other');
  });
});

describe('groupUploadedPages', () => {
  it('groups pages from the same source file for the validation dropdown', () => {
    const groups = groupUploadedPages([
      buildUploadedPage('a.png', 0, {
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageLabel: 'Page 1',
      }),
      buildUploadedPage('b.png', 1, {
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageLabel: 'Page 2',
      }),
      buildUploadedPage('c.png', 2, {
        fileIndex: 1,
        fileName: 'receipt.png',
        pageLabel: 'Page 1',
      }),
    ]);

    assert.deepEqual(groups, [
      {
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageIndices: [0, 1],
      },
      {
        fileIndex: 1,
        fileName: 'receipt.png',
        pageIndices: [2],
      },
    ]);
  });
});
