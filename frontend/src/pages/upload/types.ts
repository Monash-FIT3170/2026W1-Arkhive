// One renderable entry in the preview grid.
// PDF files produce one PreviewItem per page; images produce one each.
export type PreviewItem = {
  label: string;
  previewSrc?: string; // canvas data URL (PDF page) or blob URL (image file)
  isImage: boolean;
  hasFile: boolean;    // false = empty placeholder slot (no real file behind it)
};