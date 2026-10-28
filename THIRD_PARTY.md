# Attribution & data provenance

**Design inspiration:** [Jakeschincariol/day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) by Jake Schincariol, MIT licensed. The upstream repository is a Python/Claude skill pack covering a chart scanner, entry timer, exit planner, Time Machine, risk checks, budgets, paper/broker orders, alerts, news, earnings analysis and U.S. congressional trade disclosures.

This package is an independent, India-equities-focused JavaScript web application inspired by some of those workflows. It **does not** copy or bundle the upstream Python files, claim its full feature parity, act as a Claude skill/plugin, or offer a real brokerage interface. Strategy definitions are intentionally disclosed in the UI and README.

**NIFTY 50 membership:** official NSE Indices CSV, https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv (retrieved at runtime when reachable). Emergency fallback snapshot assembled against October 2026 NSE constituents; excludes WIPRO and includes BSE based on the index change effective September 30, 2026. Fallback is explicitly flagged.

**SENSEX 30 membership:** static October 27, 2026 snapshot referenced against https://investsights.in/lists/sensex-30-stocks-list, not an official live constituent service. Replace through SENSEX_SYMBOLS environment variable when required, and verify against BSE.

**Price and chart data:** public, unofficial Yahoo Finance endpoints (v7 spark and v8 chart). Yahoo is not affiliated with this project; data may lag, become unavailable or be rate-limited. There are no bundled price datasets or substitute fake prices.
