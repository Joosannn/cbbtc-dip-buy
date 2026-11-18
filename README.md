# Dip-Buy cbBTC Bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Joosannn/cbbtc-dip-buy/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Joosannn/cbbtc-dip-buy/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A trading bot for make.fun's [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261118-1444) bounty ($250 in USDC). It trades Coinbase Wrapped BTC (cbBTC) against USDC, one minute at a time, in the `agent-fun/bars-replay/v1` protocol.

## Strategy

cbBTC on a 1-minute replay is a slow, low-volatility market. A full round trip
costs about 26 bps (4 fee + 2 slip + ~7 impact each way), so a trade must
catch a move well above that. The bot trades rarely: it buys only when the
price has fallen hard from its recent high, and exits as soon as it has banked
a move of the same size.

- **Buy** (in cash): latest close at least 2% below the highest close of the
  last 120 bars (2 hours). Full size, all cash.
- **Sell** (holding): take profit at +2% over the entry fill price, trailing
  stop at -1% from the highest close since entry, stop loss at -1.5% below
  the entry fill price, or a time exit after 720 bars (12 hours).

The entry price is the buy fill's price, read from the batch's fills — not
the position's reported cost, which is the buy's notional (fee included) and
would overstate the entry by the 4 bps fee.

## Dev window result

Graded locally with the kit's harness on the frozen 24-hour dev window
(1,440 one-minute bars):

- **Net PnL: +$17.55** (return +1.75%), 2 trades, win rate 100%
- Max drawdown 0.76%, 0 rejected orders, deterministic (two runs identical)

That clears the dev gate (net PnL above $0), so the bot races.

## Files

- `main.ts` — the bot (Node 22, standard library only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's TypeScript SDK
  shim (excluded from authorship counts).

## License

MIT.
