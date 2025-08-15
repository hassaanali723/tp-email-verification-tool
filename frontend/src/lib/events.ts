export const FILE_UPLOAD_COMPLETE = 'fileUploadComplete';

export const emitFileUploadComplete = () => {
  const event = new CustomEvent(FILE_UPLOAD_COMPLETE);
  window.dispatchEvent(event);
}; 

// Notify UI parts (e.g., navbar) that the credit balance should refresh
export const CREDIT_BALANCE_REFRESH = 'creditBalanceRefresh';

export const emitCreditBalanceRefresh = () => {
  const event = new CustomEvent(CREDIT_BALANCE_REFRESH);
  window.dispatchEvent(event);
};