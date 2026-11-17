// The currency of the tour on screen, handed down so that every amount and
// every money field shows it without being told. It lives in its own file,
// as the store's context does, so it stays one object through a hot reload.

import { createContext, useContext } from 'react';
import { formatMoney, type Currency, type Money } from './core';

export const CurrencyCtx = createContext<Currency>('USD');

export const useCurrency = (): Currency => useContext(CurrencyCtx);

/** Writes an amount in the currency of the tour on screen: "€1,280". */
export function useMoney(): (cents: Money) => string {
  const currency = useCurrency();
  return (cents) => formatMoney(cents, currency);
}
