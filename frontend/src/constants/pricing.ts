export interface PricingTier {
	credits: number;
	pricePerCredit: number; // USD per credit
}

// Editable tier ladder. Cost per credit decreases as credits increase.
export const PRICING_TIERS: PricingTier[] = [
	{ credits: 2000, pricePerCredit: 0.0075 },
	{ credits: 5000, pricePerCredit: 0.0060 },
	{ credits: 10000, pricePerCredit: 0.0055 },
	{ credits: 25000, pricePerCredit: 0.0050 },
	{ credits: 50000, pricePerCredit: 0.0045 },
	{ credits: 100000, pricePerCredit: 0.0040 },
	{ credits: 250000, pricePerCredit: 0.0035 },
	{ credits: 500000, pricePerCredit: 0.0030 },
	{ credits: 1000000, pricePerCredit: 0.0025 },
];

export function getTierForCredits(credits: number): PricingTier {
	const sorted = [...PRICING_TIERS].sort((a, b) => a.credits - b.credits);
	let selected = sorted[0];
	for (const tier of sorted) {
		if (credits >= tier.credits) selected = tier;
		else break;
	}
	return selected;
}

export function clampCredits(raw: number): number {
	if (!Number.isFinite(raw)) return PRICING_TIERS[0].credits;
	return Math.max(PRICING_TIERS[0].credits, Math.floor(raw));
}


