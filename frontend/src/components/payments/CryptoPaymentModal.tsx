'use client'

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, ExternalLink, CheckCircle, AlertCircle, Timer, Zap } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { cn } from '@/lib/utils';

interface CryptoPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits: number;
  usdAmount: number;
}

interface Currency {
  symbol: string;
  name: string;
  icon: string;
  networkFee: string;
  confirmationTime: string;
  apiCurrency: string;
}

interface PaymentData {
  paymentId: string;
  paymentUrl: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  network: string;
  orderId: string;
  expirationEstimateDate: string;
  credits: number;
  usdAmount: number;
}

interface PaymentStatus {
  paymentStatus: string;
  actuallyPaid: number;
  txnHash?: string;
  confirmations?: number;
  processed: boolean;
}

const SUPPORTED_CURRENCIES: Currency[] = [
  {
    symbol: 'USDT',
    name: 'Tether (TRC20)',
    icon: '₮',
    networkFee: '~$1',
    confirmationTime: '1-2 min',
    apiCurrency: 'usdttrc20'
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    networkFee: '~$3-10',
    confirmationTime: '10-30 min',
    apiCurrency: 'btc'
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    icon: 'Ξ',
    networkFee: '~$5-25',
    confirmationTime: '2-10 min',
    apiCurrency: 'eth'
  },
  {
    symbol: 'USDC',
    name: 'USD Coin (ERC20)',
    icon: '$',
    networkFee: '~$5-25',
    confirmationTime: '2-10 min',
    apiCurrency: 'usdc'
  }
];

export const CryptoPaymentModal = ({ isOpen, onClose, credits, usdAmount }: CryptoPaymentModalProps) => {
  const { getToken } = useAuth();
  const [step, setStep] = useState<'select' | 'payment' | 'processing'>('select');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(SUPPORTED_CURRENCIES[0]);
  const [estimate, setEstimate] = useState<any>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Get price estimate when currency changes
  useEffect(() => {
    if (isOpen && step === 'select') {
      fetchEstimate();
    }
  }, [selectedCurrency, isOpen, credits]);

  // Start payment status polling when payment is created
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (paymentData && (step === 'payment' || step === 'processing')) {
      interval = setInterval(checkPaymentStatus, 10000); // Check every 10 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paymentData, step]);

  // Countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (paymentData && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paymentData, timeRemaining]);

  const fetchEstimate = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/payments/crypto/estimate?credits=${credits}&currency=${selectedCurrency.apiCurrency}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        setEstimate(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch estimate:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPayment = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/payments/crypto/create-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credits,
          currency: selectedCurrency.apiCurrency
        })
      });

      if (response.ok) {
        const result = await response.json();
        setPaymentData(result.data);
        
        // Calculate expiration time from ISO string
        const expirationTime = new Date(result.data.expirationEstimateDate).getTime();
        const currentTime = Date.now();
        setTimeRemaining(Math.max(0, Math.floor((expirationTime - currentTime) / 1000)));
        
        setStep('payment');
      } else {
        const error = await response.json();
        const errorMessage = error.message || 'Failed to create payment';
        
        // Handle specific currency unavailability
        if (errorMessage.includes('temporarily unavailable') || errorMessage.includes('Try it in 2 hours')) {
          alert(`${selectedCurrency.symbol} is temporarily unavailable due to maintenance. Please try BTC or ETH instead.`);
        } else {
          alert(errorMessage);
        }
      }
    } catch (error) {
      console.error('Failed to create payment:', error);
      alert('Failed to create payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!paymentData) return;

    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/payments/crypto/status/${paymentData.paymentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        setPaymentStatus(result.data);
        
        if (result.data.processed || result.data.paymentStatus === 'finished') {
          setStep('processing');
        }
      }
    } catch (error) {
      console.error('Failed to check payment status:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatAmount = (amount: number | string, decimals: number = 6): string => {
    if (amount === null || amount === undefined || amount === '') {
      return '0';
    }
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) {
      return '0';
    }
    return parseFloat(numAmount.toFixed(decimals)).toString();
  };

  const handleClose = () => {
    setStep('select');
    setPaymentData(null);
    setPaymentStatus(null);
    setTimeRemaining(0);
    onClose();
  };

  const renderSelectCurrency = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Choose Payment Method</h3>
        <div className="grid grid-cols-1 gap-3">
          {SUPPORTED_CURRENCIES.map((currency) => (
            <Card
              key={currency.symbol}
              className={cn(
                "p-4 cursor-pointer transition-all hover:shadow-md border-2",
                selectedCurrency.symbol === currency.symbol 
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => setSelectedCurrency(currency)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    {currency.icon}
                  </div>
                  <div>
                    <div className="font-semibold">{currency.symbol}</div>
                    <div className="text-sm text-gray-600">{currency.name}</div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="flex items-center space-x-1 text-gray-500">
                    <Zap className="w-3 h-3" />
                    <span>{currency.networkFee}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gray-500">
                    <Timer className="w-3 h-3" />
                    <span>{currency.confirmationTime}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {estimate && (
        <Card className="p-4 bg-gray-50">
          <h4 className="font-semibold mb-2">Payment Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Credits:</span>
              <span className="font-semibold">{estimate.credits.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>USD Amount:</span>
              <span className="font-semibold">${estimate.usdAmount}</span>
            </div>
            <div className="flex justify-between">
              <span>{selectedCurrency.symbol} Amount:</span>
              <span className="font-semibold">{formatAmount(estimate.cryptoAmount)} {selectedCurrency.symbol}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Rate:</span>
              <span>${estimate.pricePerCredit.toFixed(4)} per credit</span>
            </div>
          </div>
        </Card>
      )}

      <div className="flex space-x-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={createPayment}
          disabled={loading || !estimate}
          className="flex-1"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Continue to Payment
        </Button>
      </div>
    </div>
  );

  const renderPayment = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Timer className="w-5 h-5 text-orange-500" />
          <span className="text-lg font-mono font-bold text-orange-500">
            {formatTime(timeRemaining)}
          </span>
        </div>
        <p className="text-sm text-gray-600">Payment expires in</p>
      </div>

      <Card className="p-6 text-center">
        <div className="mb-4">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
            {selectedCurrency.icon}
          </div>
          <h3 className="text-xl font-semibold">
            Send {formatAmount(paymentData?.payAmount || 0)} {selectedCurrency.symbol}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Network: {paymentData?.network}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Wallet Address</label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 p-3 bg-gray-100 rounded-lg font-mono text-sm break-all">
                {paymentData?.payAddress}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(paymentData?.payAddress || '')}
              >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Amount</label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 p-3 bg-gray-100 rounded-lg font-mono text-sm">
                {formatAmount(paymentData?.payAmount || 0)}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(formatAmount(paymentData?.payAmount || 0))}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Button
          onClick={() => setStep('processing')}
          className="w-full"
          variant="secondary"
        >
          I've Sent the Payment
        </Button>
        <Button
          onClick={() => setStep('select')}
          variant="outline"
          className="w-full"
        >
          ← Back to Currency Selection
        </Button>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="space-y-6 text-center">
      {paymentStatus?.processed ? (
        <div>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-600">Payment Confirmed!</h3>
          <p className="text-gray-600 mb-4">
            {credits.toLocaleString()} credits have been added to your account.
          </p>
          {paymentStatus.txnHash && (
            <div className="flex items-center justify-center space-x-2">
              <ExternalLink className="w-4 h-4" />
              <a
                href={`https://blockchain.info/tx/${paymentStatus.txnHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline text-sm"
              >
                View on Blockchain
              </a>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Loader2 className="w-16 h-16 animate-spin text-blue-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold">Waiting for Payment...</h3>
          <p className="text-gray-600 mb-4">
            We're monitoring the blockchain for your payment.
          </p>
          {paymentStatus && (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <Badge variant={paymentStatus.paymentStatus === 'waiting' ? 'secondary' : 'default'}>
                  {paymentStatus.paymentStatus}
                </Badge>
              </div>
              {paymentStatus.confirmations !== undefined && (
                <p className="text-sm text-gray-500">
                  Confirmations: {paymentStatus.confirmations}/12
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Button onClick={handleClose} className="w-full">
        {paymentStatus?.processed ? 'Close' : 'Continue Monitoring in Background'}
      </Button>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-yellow-500 rounded text-white flex items-center justify-center text-sm font-bold">
              ₿
            </div>
            <span>Pay with Crypto</span>
          </DialogTitle>
          <DialogDescription>
            Purchase {credits.toLocaleString()} credits for ${usdAmount}
          </DialogDescription>
        </DialogHeader>
        
        {step === 'select' && renderSelectCurrency()}
        {step === 'payment' && renderPayment()}
        {step === 'processing' && renderProcessing()}
      </DialogContent>
    </Dialog>
  );
};