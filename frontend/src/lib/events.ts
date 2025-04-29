export const FILE_UPLOAD_COMPLETE = 'fileUploadComplete';

export const emitFileUploadComplete = () => {
  const event = new CustomEvent(FILE_UPLOAD_COMPLETE);
  window.dispatchEvent(event);
}; 