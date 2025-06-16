import React from 'react';

interface EmailDetailsModalProps {
  open: boolean;
  onClose: () => void;
  emailDetails: any; // To be typed later
}

const EmailDetailsModal: React.FC<EmailDetailsModalProps> = ({ open, onClose, emailDetails }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">&times;</button>
        <h2 className="text-lg font-semibold mb-4">Email Details</h2>
        {/* Placeholder for details */}
        <pre className="text-xs text-gray-700 bg-gray-50 rounded p-2 overflow-x-auto">{JSON.stringify(emailDetails, null, 2)}</pre>
      </div>
    </div>
  );
};

export default EmailDetailsModal; 