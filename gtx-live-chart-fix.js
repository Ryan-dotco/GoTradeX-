/* GoTradeX — single live Bybit candle renderer
   Owns ONLY #mainChart. Dashboard frame, header controls and panels stay untouched. */
(function () {
  "use strict";

  const BYBIT_REST = "https://api.bybit.com/v5/market/kline";
  const BYBIT_TRADES = "https://api.bybit.com/v5/market/recent-trade";
  const BYBIT_WS = "wss://stream.bybit.com/v5/public/spot";
  const LWC_URL = "https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js";

  const CRYPTO = new Set([
    "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
    "AVAXUSDT","DOTUSDT","LINKUSDT","LTCUSDT","BCHUSDT","TRXUSDT","SHIBUSDT",
    "TONUSDT","XLMUSDT","ATOMUSDT","ETCUSDT","FILUSDT","APTUSDT","NEARUSDT",
    "ALGOUSDT","ICPUSDT","HBARUSDT","VETUSDT","UNIUSDT","AAVEUSDT","MKRUSDT",
    "SANDUSDT","MANAUSDT","PEPEUSDT"
  ]);

  const INTERVAL = {
    "1m":"1","2m":"1","3m":"3","5m":"5","10m":"5","15m":"15","30m":"30",
    "1H":"60","2H":"120","4H":"240","6H":"360","12H":"720","1D":"D","1W":"W","1M":"M"
  };

  const SHORT = {"5s":5,"15s":15,"30s":30};

  let chart = null;
  let candlesSeries = null;
  let socket = null;
  let resizeObserver = null;
  let activeKey = "";
  let installPromise = null;

  const $ = id => document.getElementById(id);

  function state() {
    return window.state || null;
  }

  function priceText(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "Waiting for Bybit…";
    if (n >= 1000) return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
  }

  function host() {
    const el = $("mainChart");
    if (!el) throw new Error("GoTradeX chart container #mainChart was not found.");

    el.classList.add("gtx-live-chart");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.minHeight = "0";
    el.style.margin = "0";
    el.style.padding = "0";
    el.style.background = "#07111d";
    el.style.overflow = "hidden";
    el.style.position = "relative";

    const frame = el.closest(".chart-wrapper");
    if (!frame) throw new Error("GoTradeX chart frame .chart-wrapper was not found.");

    frame.style.position = "relative";
    frame.style.width = "100%";
    frame.style.height = "430px";
    frame.style.minHeight = "430px";
    frame.style.overflow = "hidden";
    frame.style.background = "#07111d";

    return el;
  }

  function cleanup() {
    if (resizeObserver) {
      try { resizeObserver.disconnect(); } catch (_) {}
      resizeObserver = null;
    }
    if (socket) {
      try { socket.close(); } catch (_) {}
      socket = null;
    }
    if (chart) {
      try { chart.remove(); } catch (_) {}
      chart = null;
    }
    candlesSeries = null;
  }

  function candle(row) {
    return {
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4])
    };
  }

  function tradeCandle(rows, seconds) {
    const buckets = new Map();

    for (const row of rows) {
      const t = Number(row.time);
      const p = Number(row.price);
      if (!Number.isFinite(t) || !Number.isFinite(p) || p <= 0) continue;

      const bucket = Math.floor(t / (seconds * 1000)) * (seconds * 1000);
      let c = buckets.get(bucket);

      if (!c) {
        c = { time: Math.floor(bucket / 1000), open:p, high:p, low:p, close:p };
        buckets.set(bucket, c);
      } else {
        c.high = Math.max(c.high, p);
        c.low = Math.min(c.low, p);
        c.close = p;
      }
    }

    return [...buckets.values()].slice(-250);
  }

  async function getHistorical(symbol, timeframe) {
    if (!CRYPTO.has(symbol)) return [];

    if (SHORT[timeframe]) {
      const url = BYBIT_TRADES + "?category=spot&symbol=" + encodeURIComponent(symbol) + "&limit=1000";
      const response = await fetch(url, {cache:"no-store"});
      if (!response.ok) throw new Error("Bybit trades HTTP " + response.status);

      const json = await response.json();
      const rows = (json?.result?.list || []).map(t => ({
        time: Number(t.time),
        price: Number(t.price)
      }));

      return tradeCandle(rows.sort((a,b)=>a.time-b.time), SHORT[timeframe]);
    }

    const interval = INTERVAL[timeframe] || "60";
    const url = BYBIT_REST + "?category=spot&symbol=" + encodeURIComponent(symbol) +
      "&interval=" + encodeURIComponent(interval) + "&limit=250";

    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error("Bybit kline HTTP " + response.status);

    const json = await response.json();
    if (Number(json?.retCode) !== 0) {
      throw new Error(json?.retMsg || "Bybit rejected the kline request.");
    }

    return (json?.result?.list || [])
      .map(candle)
      .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
      .sort((a,b)=>a.time-b.time);
  }

  function resize() {
    if (!chart) return;
    const el = $("mainChart");
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 320));
    const height = Math.max(360, Math.floor(rect.height || 360));

    try { chart.resize(width, height); } catch (_) {}
  }

  function updateHeader(symbol) {
    const s = state();
    const label = $("chartMarketToggleLabel");
    const title = $("chartSymbol");
    const price = $("btcPrice");
    const current = Number(s?.markets?.[symbol]?.price);

    if (label) label.textContent = symbol;
    if (title) {
      title.textContent = symbol.length === 6
        ? symbol.slice(0,3) + " / " + symbol.slice(3)
        : symbol;
    }
    if (price) price.textContent = current > 0 ? priceText(current) + " · LIVE" : "Waiting for Bybit…";
  }

  function render(data, symbol, timeframe) {
    const el = host();
    const lw = window.LightweightCharts;

    if (!lw?.createChart) {
      throw new Error("TradingView Lightweight Charts library is not available.");
    }
    if (data.length < 2) {
      throw new Error("Bybit returned fewer than two candles.");
    }

    cleanup();
    el.innerHTML = "";

    const rect = el.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 320));
    const height = Math.max(360, Math.floor(rect.height || 360));

    chart = lw.createChart(el, {
      width,
      height,
      layout: {
        background: { type:"solid", color:"#07111d" },
        textColor:"#aebbd0"
      },
      grid: {
        vertLines:{ color:"rgba(148,163,184,.08)" },
        horzLines:{ color:"rgba(148,163,184,.08)" }
      },
      rightPriceScale:{
        borderColor:"rgba(148,163,184,.20)",
        scaleMargins:{top:.08,bottom:.08}
      },
      timeScale:{
        borderColor:"rgba(148,163,184,.20)",
        rightOffset:8,
        barSpacing:7,
        minBarSpacing:2,
        timeVisible:true,
        secondsVisible:false
      },
      crosshair:{mode:0},
      handleScroll:true,
      handleScale:true
    });

    candlesSeries = chart.addSeries(lw.CandlestickSeries, {
      upColor:"#10c878",
      downColor:"#ef4444",
      borderUpColor:"#10c878",
      borderDownColor:"#ef4444",
      wickUpColor:"#10c878",
      wickDownColor:"#ef4444",
      priceLineVisible:true,
      lastValueVisible:true
    });

    candlesSeries.setData(data.map(c => ({
      time:c.time,
      open:c.open,
      high:c.high,
      low:c.low,
      close:c.close
    })));

    chart.timeScale().fitContent();

    resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize)
      : null;

    resizeObserver?.observe(el);
    requestAnimationFrame(resize);

    const s = state();
    if (s) {
      s.chart = {
        type:"bybit-candles",
        source:"Bybit",
        symbol,
        timeframe,
        candles:data.slice(),
        chart,
        canvas:null,
        series:{primary:candlesSeries,volume:null},
        updateCandle(c) {
          const clean = {
            time:Math.floor(Number(c.time)/1000),
            open:Number(c.open),
            high:Number(c.high),
            low:Number(c.low),
            close:Number(c.close)
          };
          if (![clean.time,clean.open,clean.high,clean.low,clean.close].every(Number.isFinite)) return;

          const list = s.chart.candles;
          const last = list[list.length - 1];

          if (last && last.time === clean.time) {
            Object.assign(last,clean);
          } else {
            list.push(clean);
            if (list.length > 250) list.shift();
          }

          try { candlesSeries?.update(clean); } catch (_) {}
        },
        destroy:cleanup
      };
    }

    updateHeader(symbol);
    return true;
  }

  function connect(symbol, timeframe) {
    if (!CRYPTO.has(symbol)) return;

    if (socket) {
      try { socket.close(); } catch (_) {}
      socket = null;
    }

    socket = new WebSocket(BYBIT_WS);

    socket.onopen = () => {
      const topic = SHORT[timeframe]
        ? "publicTrade." + symbol
        : "kline." + (INTERVAL[timeframe] || "60") + "." + symbol;

      socket.send(JSON.stringify({
        op:"subscribe",
        args:[topic]
      }));
    };

    socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        const s = state();

        if (!s?.chart || s.chart.symbol !== symbol || s.chart.timeframe !== timeframe) return;

        if (SHORT[timeframe]) {
          if (!msg.topic?.startsWith("publicTrade.") || !Array.isArray(msg.data)) return;

          const seconds = SHORT[timeframe];

          for (const t of msg.data) {
            const time = Number(t.T);
            const price = Number(t.p);

            if (!Number.isFinite(time) || !Number.isFinite(price) || price <= 0) continue;

            const bucket = Math.floor(time / (seconds * 1000)) * (seconds * 1000);
            const list = s.chart.candles;
            const last = list[list.length - 1];

            const c = last && last.time * 1000 === bucket
              ? {...last}
              : {time:Math.floor(bucket/1000),open:price,high:price,low:price,close:price};

            c.high = Math.max(c.high,price);
            c.low = Math.min(c.low,price);
            c.close = price;

            s.chart.updateCandle(c);
            s.markets[symbol] = {...(s.markets[symbol]||{}),symbol,price,source:"Bybit Live",live:true};
            updateHeader(symbol);
          }

          return;
        }

        if (!msg.topic?.startsWith("kline.") || !msg.data?.[0]) return;

        const x = msg.data[0];
        const c = {
          time:Number(x.start),
          open:Number(x.open),
          high:Number(x.high),
          low:Number(x.low),
          close:Number(x.close)
        };

        if (![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)) return;

        s.chart.updateCandle(c);
        s.markets[symbol] = {...(s.markets[symbol]||{}),symbol,price:c.close,source:"Bybit Live",live:true};
        updateHeader(symbol);

        const bid = $("gtxMobileBidPrice");
        const ask = $("gtxMobileAskPrice");
        if (bid) bid.textContent = priceText(c.close);
        if (ask) ask.textContent = priceText(c.close);
      } catch (error) {
        console.warn("GTX live candle update:", error);
      }
    };

    socket.onerror = () => console.warn("GTX Bybit WebSocket error.");
  }

  function loadLibrary() {
    if (window.LightweightCharts?.createChart) return Promise.resolve();

    if (installPromise) return installPromise;

    installPromise = new Promise((resolve,reject) => {
      const existing = document.querySelector('script[data-gtx-lwc="1"]');

      if (existing) {
        existing.addEventListener("load",() => resolve(),{once:true});
        existing.addEventListener("error",() => reject(new Error("Lightweight Charts failed to load.")),{once:true});
        return;
      }

      const script = document.createElement("script");
      script.src = LWC_URL;
      script.async = false;
      script.dataset.gtxLwc = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Lightweight Charts failed to load."));
      document.head.appendChild(script);
    });

    return installPromise;
  }

  async function install() {
    const s = state();
    if (!s) return;

    const symbol = s.currentSymbol || "BTCUSDT";
    const timeframe = s.currentTimeframe || "1H";
    const key = symbol + "|" + timeframe;

    if (activeKey === key && s.chart?.type === "bybit-candles" && s.chart.chart) return;

    activeKey = key;

    try {
      await loadLibrary();

      if (!CRYPTO.has(symbol)) {
        cleanup();
        const el = host();
        el.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#9aa9bc;font:600 14px system-ui">Live Bybit candles are available for crypto markets. Select BTC/USDT.</div>';
        return;
      }

      const data = await getHistorical(symbol,timeframe);

      if (activeKey !== key) return;
      if (!data.length) throw new Error("No live Bybit candle data returned.");

      render(data,symbol,timeframe);
      connect(symbol,timeframe);
    } catch (error) {
      console.error("GTX live chart:",error);

      const el = $("mainChart");
      if (el) {
        cleanup();
        el.innerHTML = '<div style="height:100%;display:grid;place-items:center;padding:20px;text-align:center;color:#9aa9bc;background:#07111d;font:600 14px system-ui">LIVE CHART ERROR<br><small style="font-weight:500;opacity:.8">Bybit candle data could not be loaded.</small></div>';
      }
    }
  }

  window.GTXForceLiveChart = {install};
  window.createChart = install;

  document.addEventListener("DOMContentLoaded",() => {
    setTimeout(() => install(),100);
  });

  window.addEventListener("resize",() => resize());
})();
