export type PageMetadata = {
  type?: string;
  fileIndex?: number;
  fileName?: string;
  pageLabel?: string;
};

export type UploadedPage = {
  filename: string;
  pageIndex: number;
  type: string;
  fileIndex: number;
  fileName: string;
  pageLabel?: string;
};

export type UploadedFileGroup = {
  fileIndex: number;
  fileName: string;
  pageIndices: number[];
};
