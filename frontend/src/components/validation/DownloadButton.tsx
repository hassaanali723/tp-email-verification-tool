import React from 'react';

interface DownloadButtonProps {
  fileId: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ fileId }) => {
  return (
    <button className="px-4 py-2 rounded bg-[#295c51] text-white text-sm font-medium hover:bg-[#1e453c] transition-colors">
      Download Excel
    </button>
  );
};

export default DownloadButton; 