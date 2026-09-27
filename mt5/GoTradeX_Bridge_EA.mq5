//+------------------------------------------------------------------+
//| GoTradeX MT5 Bridge EA                                           |
//| Connects GoTradeX -> Supabase -> AvaTrade MT5 via WebRequest.   |
//| Run this EA on MT5 desktop or a VPS.                            |
//+------------------------------------------------------------------+
#property strict
#property version   "1.0"
#property description "GoTradeX broker bridge for AvaTrade MT5"

#include <Trade/Trade.mqh>

input string BridgeUrl = "https://glffecggusetzklmyukv.supabase.co/functions/v1/mt5-bridge";
input string BridgeToken = "";
input long   ExpectedAccount = 0;
input bool   AllowLiveTrading = false;
input double Lots = 0.01;
input int    TimerSeconds = 5;
input int    MaxDeviationPoints = 30;
input long   MagicNumber = 26092601;

CTrade trade;
datetime lastHeartbeat = 0;

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, """, "\"");
   return value;
}

string JsonString(string key, string value)
{
   return """ + key + "":"" + JsonEscape(value) + """;
}

bool PostBridge(string body, string &response)
{
   if(StringLen(BridgeToken) < 32)
   {
      Print("GoTradeX: BridgeToken is missing.");
      return false;
   }

   string headers = "Content-Type: application/json\r\n"
                  + "x-bridge-token: " + BridgeToken + "\r\n";
   char data[];
   char result[];
   string resultHeaders;

   int copied = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(copied > 0)
      copied--;

   ResetLastError();
   int code = WebRequest("POST", BridgeUrl, headers, 10000, data, copied, result, resultHeaders);
   if(code == -1)
   {
      Print("GoTradeX WebRequest failed. Error: ", GetLastError());
      return false;
   }

   response = CharArrayToString(result, 0, -1, CP_UTF8);

   if(code < 200 || code >= 300)
   {
      Print("GoTradeX bridge HTTP ", code, ": ", response);
      return false;
   }

   return true;
}

string JsonValue(string json, string key)
{
   string needle = """ + key + "":";
   int p = StringFind(json, needle);
   if(p < 0) return "";

   p += StringLen(needle);
   while(p < StringLen(json) && (StringGetCharacter(json,p) == ' ' || StringGetCharacter(json,p) == '\n' || StringGetCharacter(json,p) == '\r'))
      p++;

   if(p < StringLen(json) && StringGetCharacter(json,p) == '"')
   {
      int start = p + 1;
      int end = StringFind(json, """, start);
      if(end < 0) return "";
      return StringSubstr(json, start, end - start);
   }

   int end = p;
   while(end < StringLen(json))
   {
      ushort c = StringGetCharacter(json,end);
      if(c == ',' || c == '}' || c == ']') break;
      end++;
   }
   return StringSubstr(json, p, end - p);
}

long JsonLong(string json, string key)
{
   return (long)StringToInteger(JsonValue(json,key));
}

double JsonDouble(string json, string key)
{
   return StringToDouble(JsonValue(json,key));
}

bool IsAccountAllowed()
{
   long login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   return ExpectedAccount <= 0 || login == ExpectedAccount;
}

double NormalizeVolume(string symbol, double volume)
{
   double minVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

   if(step <= 0) step = minVol;
   volume = MathMax(minVol, MathMin(maxVol, volume));
   volume = MathFloor(volume / step) * step;

   int digits = 0;
   double probe = step;
   while(probe < 1.0 && digits < 8)
   {
      probe *= 10.0;
      digits++;
   }

   return NormalizeDouble(volume, digits);
}

void SendHeartbeat()
{
   if(!IsAccountAllowed()) return;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyPL = equity - balance;

   int openTrades = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == MagicNumber)
         openTrades++;
   }

   string body = "{"
      + JsonString("action","heartbeat") + ","
      + ""mt5_account_id":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) + ","
      + ""running":" + (AllowLiveTrading ? "true" : "false") + ","
      + ""balance":" + DoubleToString(balance,2) + ","
      + ""equity":" + DoubleToString(equity,2) + ","
      + ""daily_pl":" + DoubleToString(dailyPL,2) + ","
      + ""open_trades":" + IntegerToString(openTrades) + ","
      + JsonString("last_error","")
      + "}";

   string response;
   PostBridge(body,response);
}

bool ClaimCommand(long commandId)
{
   string body = "{"
      + JsonString("action","claim") + ","
      + ""command_id":" + IntegerToString(commandId) + ","
      + ""mt5_account_id":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))
      + "}";

   string response;
   if(!PostBridge(body,response)) return false;
   return StringFind(response,""ok":true") >= 0;
}

void CompleteCommand(long commandId, string status, string ticket, string errorText)
{
   string body = "{"
      + JsonString("action","complete") + ","
      + ""command_id":" + IntegerToString(commandId) + ","
      + JsonString("status",status) + ","
      + JsonString("broker_ticket",ticket) + ","
      + JsonString("error",errorText)
      + "}";

   string response;
   PostBridge(body,response);
}

void PollCommands()
{
   if(!IsAccountAllowed()) return;

   string body = "{"
      + JsonString("action","poll") + ","
      + ""mt5_account_id":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))
      + "}";

   string response;
   if(!PostBridge(body,response)) return;

   long commandId = JsonLong(response,"id");
   if(commandId <= 0) return;

   string symbol = JsonValue(response,"symbol");
   string direction = JsonValue(response,"direction");
   double stopLoss = JsonDouble(response,"stop_loss");
   double takeProfit = JsonDouble(response,"take_profit");

   if(symbol == "" || (direction != "BUY" && direction != "SELL"))
   {
      CompleteCommand(commandId,"rejected","","Invalid trade command.");
      return;
   }

   if(!ClaimCommand(commandId))
      return;

   if(!AllowLiveTrading)
   {
      CompleteCommand(commandId,"rejected","","EA live trading is disabled. Set AllowLiveTrading=true after demo testing.");
      return;
   }

   if(!SymbolSelect(symbol,true))
   {
      CompleteCommand(commandId,"rejected","","Symbol is not available in this MT5 account.");
      return;
   }

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxDeviationPoints);

   double volume = NormalizeVolume(symbol,Lots);
   int digits = (int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);

   if(stopLoss > 0) stopLoss = NormalizeDouble(stopLoss,digits);
   if(takeProfit > 0) takeProfit = NormalizeDouble(takeProfit,digits);

   bool ok = false;

   if(direction == "BUY")
      ok = trade.Buy(volume,symbol,0,stopLoss,takeProfit,"GoTradeX");
   else
      ok = trade.Sell(volume,symbol,0,stopLoss,takeProfit,"GoTradeX");

   if(ok)
   {
      ulong ticket = trade.ResultOrder();
      CompleteCommand(commandId,"executed",IntegerToString((long)ticket),"");
      Print("GoTradeX executed ",direction," ",symbol," ticket=",ticket);
   }
   else
   {
      string errorText = trade.ResultRetcodeDescription();
      CompleteCommand(commandId,"rejected","",errorText);
      Print("GoTradeX order rejected: ",errorText);
   }
}

int OnInit()
{
   if(StringLen(BridgeToken) < 32)
   {
      Print("GoTradeX: enter the bridge token in EA Inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(!IsAccountAllowed())
   {
      Print("GoTradeX: this EA is attached to a different MT5 account.");
      return INIT_FAILED;
   }

   EventSetTimer(MathMax(2,TimerSeconds));
   trade.SetExpertMagicNumber(MagicNumber);
   Print("GoTradeX MT5 Bridge started. Account=",AccountInfoInteger(ACCOUNT_LOGIN),
         " LiveTrading=",AllowLiveTrading ? "ON" : "OFF");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   datetime now = TimeCurrent();

   if(now - lastHeartbeat >= 10)
   {
      SendHeartbeat();
      lastHeartbeat = now;
   }

   PollCommands();
}
