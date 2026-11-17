# StockLens backtest availability audit — 2–6 November 2026

## Verified material presently available in this conversation

- An uploaded `nifty_candles_2026-11-06_5m.xlsx` used to generate the StockLens test fixture, with **40** completed five-minute bars (**09:15–12:35 IST**). It is not the whole session.
- A November 6 **3:37 PM dashboard screenshot** listing **12** intraday rolling events, but not the underlying full-session 75-bar OHLC data.
- **No uploaded option-contract 5-minute OHLC** (CE or PE), historical option-chain quotes, order fills or broker trade book for **November 2–6**.
- **No 5-minute NIFTY/SENSEX data files for November 2, 3, 4 or 5** are available to this run.

Therefore **no legitimate complete one-week CE/PE P&L, win rate or +35-premium-point hit rate can be stated yet.** The dashboard's index target touches cannot be translated into actual option returns.

## Reproduced from the 40-candle November 6 NIFTY export only

| Confirmed IST | Setup | Side to evaluate | NIFTY index entry reference | Index target 1 | Outcome by 12:35 IST export |
| --- | --- | --- | ---: | ---: | --- |
| 09:50 | Rolling bullish breakout | CE | 24,642.05 | 24,727.57 | EXPIRED |
| 10:30 | Rolling bullish breakout | CE | 24,697.90 | 24,764.32 | STOP HIT |
| 10:40 | Failed bullish breakout → bearish reversal | PE | 24,648.70 | 24,590.70 | TARGET 1 TOUCHED |
| 10:55 | Rolling bearish breakdown | PE | 24,587.15 | 24,532.78 | EXPIRED |
| 11:05 | Failed bearish breakdown → bullish reversal | CE | 24,627.70 | 24,696.87 | EXPIRED |
| 12:15 | Rolling bullish breakout | CE | 24,661.90 | 24,721.76 | MONITORING |

**These are SIX index setup events, not six verified option trades.** The 12:15 event is not resolved within the available 40 candles. Some events overlap, so the one-open-trade-only backtest will take fewer than all the events even when genuine option data becomes available.

Run the accompanying `npm run backtest:week` CLI to obtain a five-day **research simulation** using historical option prices available to your Upstox account. It will disclose incomplete days and skipped contracts rather than invent results. The generated `trades.csv` is safe to review (never share credentials).
