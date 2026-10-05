# OANDA market data

Direct HTTPS v20 API, using httpx (no community wrapper). Credentials remain encrypted on the server. Practice and Live select the documented fixed OANDA hosts; clients cannot inject arbitrary upstream URLs.

Official sources inspected: https://developer.oanda.com/rest-live-v20/account-ep/ , https://developer.oanda.com/rest-live-v20/pricing-ep/ , and https://github.com/oanda/v20-openapi/blob/master/yaml/v20.yaml . The human-readable instrument page returned 404 in this environment; the official OpenAPI source supplied candle definitions.

- Account instruments: `/v3/accounts/{account}/instruments`.
- Pricing/tradeability: `/v3/accounts/{account}/pricing`.
- Historical candles: `/v3/instruments/{instrument}/candles`.

The instrument list is fetched from the account, then limited to currency instruments and precious-metal base codes. Metal codes classify account-returned instruments; they do not fabricate instrument availability. Bid/ask values, provider timestamps, retrieval times, incomplete-candle flags and freshness are preserved. Candle data is labeled historical. Prices older than 30 seconds are labeled delayed; this is freshness metadata, never a trading rule. No market-price cache silently presents old prices as current.

Conventional Sydney/Tokyo/London/New York hours use IANA timezones and DST. Weekend/session information does not override OANDA's tradeable status or promise holiday opening hours. There is no order endpoint. Any future execution adapter must be a separately authorized service capability.
