import React from 'react';
import { X, Mail, Globe, Server, Shield, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailValidationDetails {
  email: string;
  status: string;
  is_valid: boolean;
  risk_level: string;
  deliverability_score: number;
  details: {
    general: {
      domain: string;
      reason: string;
      validation_method: string;
    };
    attributes: {
      free_email: boolean;
      role_account: boolean;
      disposable: boolean;
      catch_all: boolean;
      has_plus_tag: boolean;
      mailbox_full: boolean;
      no_reply: boolean;
    };
    mail_server: {
      smtp_provider: string | null;
      mx_record: string | null;
      implicit_mx: string | null;
    };
    blacklist: {
      is_blacklisted: boolean;
      blacklists_found: string[];
      blacklist_reasons: string[];
      reputation_score: number;
      last_checked: string;
    };
    sub_status: string;
  };
}

interface EmailDetailsModalProps {
  open: boolean;
  onClose: () => void;
  emailDetails: EmailValidationDetails;
}

interface DetailSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'deliverable':
        return 'bg-green-100 text-green-700';
      case 'undeliverable':
        return 'bg-red-100 text-red-700';
      case 'risky':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <span className={cn(
      'px-2.5 py-0.5 rounded-full text-xs font-medium',
      getStatusColor(status)
    )}>
      {status}
    </span>
  );
};

const DetailSection: React.FC<DetailSectionProps> = ({ title, icon, children }) => (
  <div className="bg-white rounded-lg border p-4 space-y-3">
    <div className="flex items-center space-x-2 text-gray-700 font-medium">
      {icon}
      <h3>{title}</h3>
    </div>
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

const AttributeItem: React.FC<{ label: string; value: boolean }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-sm text-gray-600">{label}</span>
    {value ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-gray-300" />
    )}
  </div>
);

const EmailDetailsModal: React.FC<EmailDetailsModalProps> = ({ open, onClose, emailDetails }) => {
  if (!open) return null;

  const {
    email,
    status,
    is_valid,
    risk_level,
    deliverability_score,
    details
  } = emailDetails;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-500/20 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">{email}</h2>
            <div className="flex items-center space-x-3">
              <StatusBadge status={status} />
              <span className="text-sm text-gray-500">
                Score: {deliverability_score}%
              </span>
              {risk_level && (
                <span className={cn(
                  "text-sm px-2 py-0.5 rounded",
                  risk_level === 'high' ? 'bg-red-100 text-red-700' :
                  risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                )}>
                  {risk_level} risk
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* General Information */}
          <DetailSection title="General Information" icon={<Mail className="h-5 w-5" />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Domain</span>
                <span className="font-medium">{details.general.domain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Validation Method</span>
                <span className="font-medium">{details.general.validation_method}</span>
              </div>
              {details.general.reason && (
                <div className="flex flex-col space-y-1">
                  <span className="text-gray-600">Reason</span>
                  <span className={cn(
                    "font-medium break-words",
                    status === "deliverable" ? "text-green-600" : "text-red-600"
                  )}>{details.general.reason}</span>
                </div>
              )}
              {details.sub_status && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Sub Status</span>
                  <span className="font-medium">{details.sub_status}</span>
                </div>
              )}
            </div>
          </DetailSection>

          {/* Mail Server Information */}
          <DetailSection title="Mail Server" icon={<Server className="h-5 w-5" />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">SMTP Provider</span>
                <span className="font-medium">{details.mail_server.smtp_provider || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">MX Record</span>
                <span className="font-medium">{details.mail_server.mx_record || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Implicit MX</span>
                <span className="font-medium">{details.mail_server.implicit_mx || 'N/A'}</span>
              </div>
            </div>
          </DetailSection>

          {/* Email Attributes */}
          <DetailSection title="Email Attributes" icon={<Globe className="h-5 w-5" />}>
            <div className="grid grid-cols-1 gap-1">
              <AttributeItem label="Free Email Provider" value={details.attributes.free_email} />
              <AttributeItem label="Role Account" value={details.attributes.role_account} />
              <AttributeItem label="Disposable" value={details.attributes.disposable} />
              <AttributeItem label="Catch All" value={details.attributes.catch_all} />
              <AttributeItem label="Has Plus Tag" value={details.attributes.has_plus_tag} />
              <AttributeItem label="Mailbox Full" value={details.attributes.mailbox_full} />
              <AttributeItem label="No Reply Address" value={details.attributes.no_reply} />
            </div>
          </DetailSection>

          {/* Blacklist Information */}
          <DetailSection title="Security & Reputation" icon={<Shield className="h-5 w-5" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Reputation Score</span>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full",
                        details.blacklist.reputation_score > 80 ? "bg-green-500" :
                        details.blacklist.reputation_score > 60 ? "bg-yellow-500" :
                        "bg-red-500"
                      )}
                      style={{ width: `${details.blacklist.reputation_score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{details.blacklist.reputation_score}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Blacklisted</span>
                {details.blacklist.is_blacklisted ? (
                  <span className="text-red-600 text-sm font-medium flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Yes
                  </span>
                ) : (
                  <span className="text-green-600 text-sm font-medium flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    No
                  </span>
                )}
              </div>

              {details.blacklist.blacklists_found.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm text-gray-600">Found in blacklists:</span>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {details.blacklist.blacklists_found.map((list, index) => (
                      <li key={index}>{list}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-gray-500">
                Last checked: {new Date(details.blacklist.last_checked).toLocaleString()}
              </div>
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
};

export default EmailDetailsModal; 