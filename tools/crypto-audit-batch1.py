#!/usr/bin/env python3
"""Read-only 10-asset crypto provider audit. No credentials and no orders."""
import csv, json, time, urllib.request, urllib.error
from datetime import datetime, timezone

ASSETS = ["LINK", "TRX", "TON", "ATOM", "UNI", "BCH", "ETC", "XLM", "NEAR", "APT"]
OUT = "crypto-audit-batch1.csv"
UA = "GoTradeX-ReadOnly-Crypto-Audit/1.0"

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))

def attempt(provider, asset, url, parse):
    try:
        data = get_json(url)
        symbol, price = parse(data)
        ok = bool(symbol and price is not None and float(price) > 0)
        return {"asset": asset+"/USD", "provider": provider, "symbol_match": symbol or "NOT FOUND",
                "live_price": str(price) if ok else "NO VALID PRICE",
                "result": "LIVE PRICE PASS" if ok else "IN REVIEW",
                "error": "" if ok else "No valid positive price in response"}
    except Exception as exc:
        return {"asset": asset+"/USD", "provider": provider, "symbol_match": "CHECK ERROR",
                "live_price": "", "result": "IN REVIEW",
                "error": (type(exc).__name__ + ": " + str(exc))[:300]}

def bybit(asset):
    symbol=asset+"USDT"
    return attempt("Bybit Spot",asset,"https://api.bybit.com/v5/market/tickers?category=spot&symbol="+symbol,
      lambda d: (symbol, next((x.get("lastPrice") for x in d.get("result",{}).get("list",[]) if x.get("symbol")==symbol and d.get("retCode")==0), None)))

def binance(asset):
    symbol=asset+"USDT"
    return attempt("Binance Spot",asset,"https://api.binance.com/api/v3/ticker/price?symbol="+symbol,
      lambda d: (symbol, d.get("price") if d.get("symbol")==symbol else None))

def kraken(asset):
    pair=("XBT" if asset=="BTC" else asset)+"USD"
    return attempt("Kraken",asset,"https://api.kraken.com/0/public/Ticker?pair="+pair,
      lambda d: (next(iter(d.get("result",{}).keys()), ""), next(iter(next(iter(d.get("result",{}).values()),{}).get("c",[])),None) if not d.get("error") else None))

def coinbase(asset):
    symbol=asset+"-USD"
    return attempt("Coinbase",asset,"https://api.exchange.coinbase.com/products/"+symbol+"/ticker",
      lambda d: (symbol, d.get("price") if isinstance(d,dict) and d.get("price") else None))

def main():
    rows=[]
    for asset in ASSETS:
        print("Testing", asset, flush=True)
        for fn in (bybit, binance, kraken, coinbase):
            row=fn(asset); row["checked_at_utc"]=datetime.now(timezone.utc).isoformat()
            rows.append(row)
            print(asset, row["provider"], row["result"], row["symbol_match"], row["live_price"], row["error"], flush=True)
            time.sleep(0.15)
    fields=["asset","provider","symbol_match","live_price","result","error","checked_at_utc"]
    with open(OUT,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
    print("Wrote", OUT, "rows:", len(rows), flush=True)

if __name__=="__main__": main()
