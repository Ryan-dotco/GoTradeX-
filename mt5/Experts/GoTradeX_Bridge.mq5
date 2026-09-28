//+------------------------------------------------------------------+
//| GoTradeX Bridge EA                                               |
//| Zero-cost MT5 -> GoTradeX signal/data bridge                    |
//| Initial mode: SIGNAL DATA ONLY. No live orders are placed.      |
//+------------------------------------------------------------------+
#property strict
#property version   "1.0"
#property description "Sends MT5 market data and technical signals to GoTradeX."
#property description "Live order execution is intentionally disabled in this first version."

input string InpBridgeUrl   = "https://glffecggusetzklmyukv.supabase.co/functions/v1/mt5-bridge";
input string InpBridgeToken = "";
input int    InpTimerSeconds = 5;
input int    InpEMAFast = 9;
input int    InpEMASlow = 21;
input int    InpRSIPeriod = 14;
input int    InpMomentumBars = 10;

int hEmaFast = INVALID_HANDLE;
int hEmaSlow = INVALID_HANDLE;
int hRsi     = INVALID_HANDLE;
datetime lastCandle = 0;

string JsonNumber(double value)
{
   if(!MathIsValidNumber(value))
      return "null";
   return DoubleToString(value, _Digits);
}

string JsonString(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, """, "\\"");
   return """ + value + """;
}

bool SendBridge(string action, string extraJson, string &responseText)
{
   responseText = "";

   if(InpBridgeUrl == "" || InpBridgeToken == "")
   {
      Print("GoTradeX Bridge: Bridge URL/token is not configured.");
      return false;
   }

   string headers =
      "Content-Type: application/json\r\n"
      "x-bridge-token: " + InpBridgeToken + "\r\n";

   string json =
      "{"
      ""action":" + JsonString(action) + ","
      ""mt5_account_id":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));

   if(extraJson != "")
      json += "," + extraJson;

   json += "}";

   char data[];
   char result[];
   string resultHeaders;

   int bytes = StringToCharArray(json, data, 0, -1, CP_UTF8);
   if(bytes > 0)
      ArrayResize(data, bytes - 1);

   ResetLastError();
   int code = WebRequest(
      "POST",
      InpBridgeUrl,
      headers,
      10000,
      data,
      result,
      resultHeaders
   );

   if(code == -1)
   {
      Print("GoTradeX Bridge WebRequest failed. Error=", GetLastError());
      return false;
   }

   responseText = CharArrayToString(result);

   if(code < 200 || code >= 300)
   {
      Print("GoTradeX Bridge HTTP ", code, ": ", responseText);
      return false;
   }

   return true;
}

bool GetIndicatorValue(int handle, double &value)
{
   double buffer[];
   ArraySetAsSeries(buffer, true);

   if(CopyBuffer(handle, 0, 0, 1, buffer) != 1)
      return false;

   value = buffer[0];
   return MathIsValidNumber(value);
}

bool CalculateSignal(
   double emaFast,
   double emaSlow,
   double rsi,
   double momentum,
   string &signal,
   double &confidence
)
{
   int score = 0;

   if(emaFast > emaSlow) score++;
   else if(emaFast < emaSlow) score--;

   if(rsi >= 55.0) score++;
   else if(rsi <= 45.0) score--;

   if(momentum > 0.15) score++;
   else if(momentum < -0.15) score--;

   signal = "HOLD";

   if(score >= 2)
      signal = "BUY";
   else if(score <= -2)
      signal = "SELL";

   confidence = 50.0 + MathAbs(score) * 10.0;
   if(signal == "HOLD")
      confidence = 50.0 + MathMin(MathAbs(momentum) * 2.0, 10.0);

   if(confidence > 85.0)
      confidence = 85.0;

   return true;
}

bool SendHeartbeat()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyPL = equity - balance;

   int openTrades = PositionsTotal();

   string response;
   string extra =
      ""connected":true,"
      ""running":true,"
      ""balance":" + JsonNumber(balance) + ","
      ""equity":" + JsonNumber(equity) + ","
      ""daily_pl":" + JsonNumber(dailyPL) + ","
      ""open_trades":" + IntegerToString(openTrades) + ","
      ""last_error":""";

   return SendBridge("heartbeat", extra, response);
}

bool SendSignal()
{
   double emaFast, emaSlow, rsi;

   if(!GetIndicatorValue(hEmaFast, emaFast))
      return false;

   if(!GetIndicatorValue(hEmaSlow, emaSlow))
      return false;

   if(!GetIndicatorValue(hRsi, rsi))
      return false;

   double closes[];
   ArraySetAsSeries(closes, true);

   int needed = InpMomentumBars + 1;
   if(CopyClose(_Symbol, PERIOD_CURRENT, 0, needed, closes) < needed)
      return false;

   double currentPrice = closes[0];
   double oldPrice = closes[InpMomentumBars];

   if(oldPrice <= 0.0)
      return false;

   double momentum = ((currentPrice - oldPrice) / oldPrice) * 100.0;

   string signal;
   double confidence;

   CalculateSignal(emaFast, emaSlow, rsi, momentum, signal, confidence);

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   datetime candleTime = iTime(_Symbol, PERIOD_CURRENT, 0);

   string response;
   string extra =
      ""symbol":" + JsonString(_Symbol) + ","
      ""timeframe":" + JsonString(EnumToString((ENUM_TIMEFRAMES)Period())) + ","
      ""bid":" + JsonNumber(tick.bid) + ","
      ""ask":" + JsonNumber(tick.ask) + ","
      ""last_price":" + JsonNumber(currentPrice) + ","
      ""signal":" + JsonString(signal) + ","
      ""confidence":" + JsonNumber(confidence) + ","
      ""entry":" + JsonNumber(currentPrice) + ","
      ""stop_loss":null,"
      ""take_profit":null,"
      ""ema9":" + JsonNumber(emaFast) + ","
      ""ema21":" + JsonNumber(emaSlow) + ","
      ""rsi":" + JsonNumber(rsi) + ","
      ""momentum":" + JsonNumber(momentum) + ","
      ""candle_time":" + JsonString(TimeToString(candleTime, TIME_DATE | TIME_SECONDS));

   bool ok = SendBridge("signal", extra, response);

   if(ok)
      Print(
         "GoTradeX signal: ",
         _Symbol,
         " ",
         signal,
         " confidence=",
         DoubleToString(confidence, 1),
         " EMA9=",
         DoubleToString(emaFast, _Digits),
         " EMA21=",
         DoubleToString(emaSlow, _Digits),
         " RSI=",
         DoubleToString(rsi, 1),
         " Momentum=",
         DoubleToString(momentum, 3),
         "%"
      );

   return ok;
}

void OnInit()
{
   if(InpBridgeUrl == "")
   {
      Print("GoTradeX Bridge: set InpBridgeUrl.");
      return;
   }

   if(InpBridgeToken == "")
      Print("GoTradeX Bridge: token is empty. The EA will not transmit until a token is entered.");

   hEmaFast = iMA(_Symbol, PERIOD_CURRENT, InpEMAFast, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow = iMA(_Symbol, PERIOD_CURRENT, InpEMASlow, 0, MODE_EMA, PRICE_CLOSE);
   hRsi     = iRSI(_Symbol, PERIOD_CURRENT, InpRSIPeriod, PRICE_CLOSE);

   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hRsi == INVALID_HANDLE)
   {
      Print("GoTradeX Bridge: failed to create indicator handles.");
      return;
   }

   int seconds = MathMax(2, InpTimerSeconds);
   EventSetTimer(seconds);

   Print("GoTradeX Bridge EA initialized on ", _Symbol, ".");
   Print("IMPORTANT: signal/data mode only. No live trade functions are enabled.");
}

void OnDeinit(const int reason)
{
   EventKillTimer();

   if(hEmaFast != INVALID_HANDLE) IndicatorRelease(hEmaFast);
   if(hEmaSlow != INVALID_HANDLE) IndicatorRelease(hEmaSlow);
   if(hRsi != INVALID_HANDLE) IndicatorRelease(hRsi);
}

void OnTick()
{
   // Data transmission is timer-driven to avoid excessive HTTP requests.
}

void OnTimer()
{
   if(InpBridgeToken == "")
      return;

   SendHeartbeat();
   SendSignal();
}
//+------------------------------------------------------------------+
