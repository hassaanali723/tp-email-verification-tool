'use client'

import { useEffect, useMemo, useState } from 'react';
import { PRICING_TIERS, getTierForCredits, clampCredits } from '@/constants/pricing';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@clerk/nextjs';
import { createCheckoutSession } from '@/lib/payments-api';

export default function PricingPage() {
	const { getToken } = useAuth();
	const [mode, setMode] = useState<'payg' | 'subscription'>('payg');
	const [selectedCredits, setSelectedCredits] = useState<number>(PRICING_TIERS[1]?.credits ?? 5000);
	const [customInput, setCustomInput] = useState<string>(String(PRICING_TIERS[1]?.credits ?? 5000));
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		setCustomInput(String(selectedCredits));
	}, [selectedCredits]);

	const currentPricePerCredit = useMemo(() => getTierForCredits(selectedCredits).pricePerCredit, [selectedCredits]);
	const discountMultiplier = mode === 'subscription' ? 0.95 : 1; // 5% discount for subscription
	const total = useMemo(() => Number((selectedCredits * currentPricePerCredit * discountMultiplier).toFixed(2)), [selectedCredits, currentPricePerCredit, discountMultiplier]);

	const formattedCpc = useMemo(() => `$${(currentPricePerCredit * discountMultiplier).toFixed(4)}`, [currentPricePerCredit, discountMultiplier]);

	const handleCustomInputBlur = () => {
		const parsed = clampCredits(Number(customInput.replace(/[,\s]/g, '')));
		setSelectedCredits(parsed);
		setCustomInput(String(parsed));
	};

	const handleCheckout = async () => {
		if (mode === 'subscription') return; // Subscription flow not implemented yet
		setIsLoading(true);
		try {
			const token = await getToken();
			const { success, url } = await createCheckoutSession(token, selectedCredits);
			if (success && url) {
				window.location.href = url;
			}
		} catch (err) {
			console.error('Checkout error', err);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<h1 className="text-xl font-semibold text-gray-900">Buy Credits</h1>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{/* Left: Tiers */}
				<Card className="p-6 md:col-span-2">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium text-gray-700">Choose a package</h2>
						<div className="flex items-center gap-3 text-sm">
							<button
								className={cn('px-3 py-1 rounded-full border text-sm', mode === 'payg' ? 'bg-green-50 text-[#295c51] border-green-200' : 'bg-white text-gray-700 border-gray-200')}
								onClick={() => setMode('payg')}
							>
								Pay-As-You-Go
							</button>
							<button
								className={cn('px-3 py-1 rounded-full border text-sm', mode === 'subscription' ? 'bg-green-50 text-[#295c51] border-green-200' : 'bg-white text-gray-700 border-gray-200')}
								onClick={() => setMode('subscription')}
							>
								Subscription (5% off)
							</button>
						</div>
					</div>

					<div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
						{PRICING_TIERS.map((tier) => (
							<button
								key={tier.credits}
								className={cn(
									'rounded-lg border p-4 text-left transition hover:border-green-300 hover:bg-green-50',
									tier.credits === selectedCredits ? 'border-[#295c51] bg-green-50' : 'border-gray-200 bg-white'
								)}
								onClick={() => setSelectedCredits(tier.credits)}
							>
								<div className="text-lg font-semibold text-gray-900">{tier.credits.toLocaleString()}</div>
								<div className="text-xs text-gray-500">Credits</div>
							</button>
						))}
					</div>

					<div className="mt-8">
						<div className="text-center text-xs text-gray-500 uppercase tracking-wide">Or enter an amount of credits</div>
						<div className="mt-2 max-w-sm mx-auto">
							<input
								type="number"
								min={PRICING_TIERS[0].credits}
								value={customInput}
								onChange={(e) => setCustomInput(e.target.value)}
								onBlur={handleCustomInputBlur}
								placeholder={`${PRICING_TIERS[0].credits} minimum`}
								className="w-full h-11 px-3 rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-[#295c51] focus:ring-[#295c51]"
							/>
						</div>
					</div>
				</Card>

				{/* Right: Summary */}
				<Card className="p-6 h-full flex flex-col justify-between">
					<div>
						<div className="text-5xl font-semibold text-gray-900">${total}</div>
						<div className="mt-2 text-xs text-gray-500 uppercase tracking-wide">Cost per credit</div>
						<div className="text-sm font-medium text-gray-800">{formattedCpc}</div>
						<div className="mt-6 text-sm text-gray-600">
							<div className="flex justify-between"><span>{selectedCredits.toLocaleString()} credits</span><span>${(selectedCredits * currentPricePerCredit).toFixed(2)}</span></div>
							{mode === 'subscription' && (
								<div className="flex justify-between text-[#673ab7]"><span>5% subscription discount</span><span>- ${(selectedCredits * currentPricePerCredit * 0.05).toFixed(2)}</span></div>
							)}
							<div className="flex justify-between font-semibold mt-2"><span>Total</span><span>${total.toFixed(2)}</span></div>
						</div>
					</div>
					<div className="mt-6">
						<Button
							onClick={handleCheckout}
							disabled={mode === 'subscription' || isLoading}
							className="w-full bg-[#295c51] hover:bg-[#1e453c]"
						>
							{mode === 'subscription' ? 'Subscription coming soon' : isLoading ? 'Creating checkout...' : 'Next'}
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}


