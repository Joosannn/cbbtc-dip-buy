// Dip-buy bot for the BTC 24h race (agent-fun/bars-replay/v1).
//
// Idea: cbBTC on a 1-minute replay is a slow, low-volatility market. A full
// round trip costs about 26 bps (4 fee + 2 slip + ~7 impact each way), so a
// trade must catch a move well above that. The bot therefore trades rarely,
// only when the price has fallen hard from its recent high, and exits as soon
// as it has banked a move of the same size.
//
//   Buy  (in cash): the latest close is at least 2% below the highest close
//          of the last 120 bars (2 hours). Full size, all cash.
//   Sell (holding): any of
//          - take profit: close >= entry fill price x 1.02,
//          - trailing stop: close <= highest close since entry x 0.99,
//          - stop loss: close <= entry fill price x 0.985,
//          - time exit: held 720 bars (12 hours) without an exit.
//   The entry price is the buy fill's price (what was actually paid). It is
//   read from the batch's fills, not from the position's cost: the cost the
//   harness reports is the buy's notional (fee included), which overstates
//   the entry price by the 4 bps fee and would push the take-profit out of
//   reach. Verified on the dev window: cost-basis entry gave +$7.57, the
//   fill-price entry gives +$17.55 for the same trade.
//
// Everything is deterministic: no clock, no environment, no randomness. The
// only state is the close history and the entry/peak tracking, all derived
// from the batches the harness sends.

import { BPS, runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 120; // bars of history for the dip reference (2 hours)
const DIP_BPS = 200n; // buy when close is >= 2% below the 120-bar high
const TAKE_PROFIT_BPS = 200n; // sell at +2% over the entry fill price
const TRAIL_BPS = 100n; // sell at -1% from the highest close since entry
const STOP_LOSS_BPS = 150n; // sell at -1.5% below the entry fill price
const TIME_EXIT_BARS = 720; // sell after 12 hours held, whatever the price
const MAX_SLIPPAGE_BPS = 10_000;

/** Each batch's latest close, as ints (null when the symbol had no bar). */
const closes: (bigint | null)[] = [];
/** Seq of the batch on which the current position opened. */
let entrySeq: number | null = null;
/** The buy fill's price (price-scale ints), 0 while flat. */
let entryPx = 0n;
/** Highest close since the current position opened. */
let peak = 0n;

function sellAll(qty: bigint): OrderInput[] {
  return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state, batch) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    // A buy decided on the previous batch fills at this bar's open and
    // arrives in this batch's fills: that fill price is the entry price.
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'buy' && fill.status === 'filled') {
        entrySeq = state.seq;
        entryPx = BigInt(fill.price);
        peak = close;
      }
    }
    const holding = state.positions.get(SYMBOL);
    const qty = holding?.qty ?? 0n;

    if (qty === 0n) {
      entrySeq = null;
      entryPx = 0n;
      peak = 0n;
      if (closes.length < LOOKBACK + 1) return [];
      let high = 0n;
      for (let i = closes.length - LOOKBACK; i < closes.length; i++) {
        const c = closes[i];
        if (c !== null && c > high) high = c;
      }
      // Buy the dip: close at least DIP_BPS below the 120-bar high.
      if (close * BPS <= high * (BPS - DIP_BPS)) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Holding: keep the peak since entry current. entryPx/entrySeq come
    // from the buy fill above; if a position were ever present without one
    // (it never is: we start flat), fall back to the latest close.
    if (entrySeq === null) {
      entrySeq = state.seq;
      entryPx = close;
      peak = close;
    }
    if (close > peak) peak = close;

    // Take profit from the entry fill price.
    if (entryPx !== 0n && close * BPS >= entryPx * (BPS + TAKE_PROFIT_BPS)) return sellAll(qty);
    // Trailing stop from the peak since entry.
    if (close * BPS <= peak * (BPS - TRAIL_BPS)) return sellAll(qty);
    // Stop loss from the entry fill price.
    if (entryPx !== 0n && close * BPS <= entryPx * (BPS - STOP_LOSS_BPS)) return sellAll(qty);
    // Time exit: do not hold a stale position into the next regime.
    if (entrySeq !== null && state.seq - entrySeq >= TIME_EXIT_BARS) return sellAll(qty);
    return [];
  },
});
