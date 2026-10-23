#!/usr/bin/env python3
"""Read-only provider price audit for GoTradeX's 99 crypto assets. No orders."""
import csv, json, time, urllib.request
from datetime import datetime, timezone

ASSETS = """BTC ETH XRP SOL ADA DOGE LTC BNB AVAX DOT LINK TRX TON ATOM UNI BCH ETC XLM NEAR APT ARB OP SUI FIL ALGO SHIB PEPE AAVE ICP INJ SEI WIF RENDER SAND MANA GALA FET ONDO JUP POL RUNE IMX LDO CRV AR STX TIA KAS HBAR VET XTZ THETA ZIL EGLD KAVA ROSE MINA QNT ENS COMP SNX DYDX PENDLE ENA WLD JTO PYTH JASMY AXS CHZ BOME NOT STRK ZK BLUR MASK GMT APE FLOW DYM ALT AEVO ORDI CORE BEAM GRT QTUM LRC ENJ BAT ZRX 1INCH YFI TWT ARKM MANTA BLAST ZETA XAI""".split()
OUT = "gotradex-crypto-audit-all-99.csv"
UA = "GoTradeX-ReadOnly-Crypto-Audit/1.1"

def get_json(url):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))

def attempt(provider,asset,url,parse):
    try:
        d=get_json(url)
        symbol,price=parse(d)
        ok=bool(symbol and price is not None and float(price)>0)
        return {"asset":asset+"/USD","provider":provider,"symbol_match":symbol or "NOT FOUND",
                "live_price":str(price) if ok else "NO VALID PRICE",
                "result":"LIVE PRICE PASS" if ok else "IN REVIEW",
                "error":"" if ok else "No valid positive price in response"}
    except Exception as e:
        return {"asset":asset+"/USD","provider":provider,"symbol_match":"CHECK ERROR",
                "live_price":"","result":"IN REVIEW","error":(type(e).__name__+": "+str(e))[:300]}

def bybit(asset):
    s=asset+"USDT"
    return attempt("Bybit Spot",asset,"https://api.bybit.com/v5/market/tickers?category=spot&symbol="+s,
      lambda d:(s,next((x.get("lastPrice") for x in d.get("result",{}).get("list",[]) if d.get("retCode")==0 and x.get("symbol")==s),None)))
def binance(asset):
    s=asset+"USDT"
    return attempt("Binance Spot",asset,"https://api.binance.com/api/v3/ticker/price?symbol="+s,
      lambda d:(s,d.get("price") if isinstance(d,dict) and d.get("symbol")==s else None))
def kraken(asset):
    q=("XBT" if asset=="BTC" else asset)+"USD"
    return attempt("Kraken",asset,"https://api.kraken.com/0/public/Ticker?pair="+q,
      lambda d:(next(iter(d.get("result",{}).keys()),""),next(iter(next(iter(d.get("result",{}).values()),{}).get("c",[])),None) if not d.get("error") else None))
def coinbase(asset):
    s=asset+"-USD"
    return attempt("Coinbase",asset,"https://api.exchange.coinbase.com/products/"+s+"/ticker",
      lambda d:(s,d.get("price") if isinstance(d,dict) and d.get("price") else None))

def main():
    rows=[]
    for i,asset in enumerate(ASSETS,1):
        print(f"[{i}/{len(ASSETS)}] {asset}/USD",flush=True)
        for fn in (bybit,binance,kraken,coinbase):
            row=fn(asset);row["checked_at_utc"]=datetime.now(timezone.utc).isoformat();rows.append(row)
            print(" ",row["provider"],row["result"],row["symbol_match"],row["live_price"],row["error"],flush=True)
            time.sleep(0.2)
    fields=["asset","provider","symbol_match","live_price","result","error","checked_at_utc"]
    with open(OUT,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
    print(f"Wrote {OUT}: {len(rows)} checks for {len(ASSETS)} app assets",flush=True)

if __name__=="__main__":main()
