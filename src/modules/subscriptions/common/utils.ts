export function formatCentsToPrice(amountInCents: number, currency: string) {
  const amountInDollars = centsToDollars(amountInCents);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInDollars);
}

export function centsToDollars(amountInCents: number) {
  return amountInCents / 100;
}
