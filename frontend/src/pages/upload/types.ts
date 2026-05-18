// One renderable entry in the preview grid.
// PDF files produce one PreviewItem per page; images produce one each.
export type PreviewItem = {
  label: string;
  subtitle?: string;
  previewSrc?: string; // canvas data URL (PDF page) or blob URL (image file)
  isImage: boolean;
  hasFile: boolean;    // false = empty placeholder slot (no real file behind it)
  fileIndex?: number;  // each preview card shares the same index as its parent file, not necessarily the index in the files array
  isBlurry?: boolean;
  isDark?: boolean;
  shouldWarn?: boolean;
};