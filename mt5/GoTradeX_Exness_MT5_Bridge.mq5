#property strict
#property version   "1.0"
#property description "GoTradeX Exness MT5 bridge"

#include <Trade/Trade.mqh>

input string BridgeURL = "https://glffecggusetzklmyukv.supabase.co/functions/v1/gotradex-mt5-bridge";
input string BotKey = "CHANGE_ME";
input long   MT5AccountID = 0;
input ulong  MagicNumber = 26092501;
input int    PollSeconds = 5;
input double ConservativeRiskPercent = 0.25;
input double ModerateRiskPercent = 0.50;
input double AggressiveRiskPercent = 1.00;

CTrade trade;
double peakEquity = 0.0;
bool localTradingAllowed = true;

bool SendAck(const long commandId,const string status,const string ticket,const string errorText);
bool SendStatus(const string errorText="");
bool TripBot(const string reason);

string EscapeJson(const string value)
{
   string s=value;
   StringReplace(s,"\\","\\\\");
   StringReplace(s,"\"","\\\"");
   return s;
}

bool HttpPost(const string body,string &response,int &status)
{
   string headers="Content-Type: application/json\r\nX-GoTradeX-Bot-Key: "+BotKey+"\r\n";
   char data[],result[];
   string resultHeaders="";
   StringToCharArray(body,data,0,StringLen(body),CP_UTF8);
   ResetLastError();
   status=WebRequest("POST",BridgeURL,headers,5000,data,ArraySize(data),result,resultHeaders);
   if(status==-1)
   {
      Print("GoTradeX WebRequest error: ",GetLastError());
      response="";
      return false;
   }
   response=CharArrayToString(result,0,ArraySize(result),CP_UTF8);
   return true;
}

double RiskPercentFor(const string risk)
{
   if(risk=="aggressive") return AggressiveRiskPercent;
   if(risk=="moderate") return ModerateRiskPercent;
   return ConservativeRiskPercent;
}

bool HasOpenPositionForSymbol(const string symbol)
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=symbol) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC)==MagicNumber) return true;
   }
   return false;
}

double CalculateVolume(const string symbol,const ENUM_ORDER_TYPE type,
                       const double entry,const double stop,const string risk)
{
   double riskMoney=AccountInfoDouble(ACCOUNT_BALANCE)*RiskPercentFor(risk)/100.0;
   double lossOneLot=0.0;
   if(riskMoney<=0.0 || entry<=0.0 || stop<=0.0) return 0.0;
   if(!OrderCalcProfit(type,symbol,1.0,entry,stop,lossOneLot)) return 0.0;
   lossOneLot=MathAbs(lossOneLot);
   if(lossOneLot<=0.0) return 0.0;

   double volume=riskMoney/lossOneLot;
   double minVol=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double maxVol=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   if(step<=0.0) step=minVol;
   volume=MathFloor(volume/step)*step;
   volume=MathMax(minVol,MathMin(maxVol,volume));

   int digits=2;
   if(step>=1.0) digits=0;
   else if(step>=0.1) digits=1;
   else if(step>=0.01) digits=2;
   else digits=3;

   return NormalizeDouble(volume,digits);
}

bool DrawdownAllowsTrade(const double maxDD)
{
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity>peakEquity) peakEquity=equity;
   if(peakEquity<=0.0) return false;

   if(equity<=peakEquity*(1.0-maxDD/100.0))
   {
      localTradingAllowed=false;
      TripBot("Maximum drawdown protection reached");
      SendStatus("Maximum drawdown protection reached");
      return false;
   }
   return localTradingAllowed;
}

bool ExecuteTrade(const long commandId,const string symbol,const string direction,
                  const double entry,const double sl,const double tp,
                  const string risk,const double maxDD)
{
   if(!localTradingAllowed) return false;
   if(!DrawdownAllowsTrade(maxDD))
   {
      SendAck(commandId,"rejected","","Maximum drawdown protection reached");
      return false;
   }

   if(!SymbolSelect(symbol,true))
   {
      SendAck(commandId,"rejected","","Symbol not available: "+symbol);
      return false;
   }

   if(HasOpenPositionForSymbol(symbol))
   {
      SendAck(commandId,"rejected","","Existing GoTradeX position for symbol");
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick))
   {
      SendAck(commandId,"rejected","","No current tick for symbol");
      return false;
   }

   ENUM_ORDER_TYPE type=(direction=="BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double marketPrice=(direction=="BUY") ? tick.ask : tick.bid;

   if(sl<=0.0 || tp<=0.0)
   {
      SendAck(commandId,"rejected","","Stop loss and take profit are required");
      return false;
   }

   if(direction=="BUY" && !(sl<marketPrice && tp>marketPrice))
   {
      SendAck(commandId,"rejected","","Invalid BUY SL/TP");
      return false;
   }

   if(direction=="SELL" && !(sl>marketPrice && tp<marketPrice))
   {
      SendAck(commandId,"rejected","","Invalid SELL SL/TP");
      return false;
   }

   double volume=CalculateVolume(symbol,type,marketPrice,sl,risk);
   if(volume<=0.0)
   {
      SendAck(commandId,"rejected","","Unable to calculate safe position size");
      return false;
   }

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFillingBySymbol(symbol);

   string comment=StringFormat("GoTradeX #%I64d",commandId);
   bool ok=(direction=="BUY")
      ? trade.Buy(volume,symbol,0.0,sl,tp,comment)
      : trade.Sell(volume,symbol,0.0,sl,tp,comment);

   uint retcode=trade.ResultRetcode();
   if(!ok || (retcode!=TRADE_RETCODE_DONE &&
              retcode!=TRADE_RETCODE_PLACED &&
              retcode!=TRADE_RETCODE_DONE_PARTIAL))
   {
      string reason=StringFormat("Trade rejected. Retcode=%u %s",
                                 retcode,trade.ResultRetcodeDescription());
      SendAck(commandId,"rejected","",reason);
      return false;
   }

   string ticket=IntegerToString((long)trade.ResultDeal());
   SendAck(commandId,"executed",ticket,"");
   Print("GoTradeX executed ",direction," ",symbol,
         " volume=",DoubleToString(volume,2)," deal=",ticket);
   return true;
}

bool SendAck(const long commandId,const string status,const string ticket,const string errorText)
{
   string body=StringFormat(
      "{\"action\":\"ack\",\"account_id\":%I64d,\"command_id\":%I64d,\"status\":\"%s\",\"ticket\":\"%s\",\"error\":\"%s\"}",
      MT5AccountID,commandId,status,EscapeJson(ticket),EscapeJson(errorText));

   string response; int httpStatus;
   return HttpPost(body,response,httpStatus) && httpStatus>=200 && httpStatus<300;
}

bool TripBot(const string reason)
{
   string body=StringFormat(
      "{\"action\":\"trip\",\"account_id\":%I64d,\"reason\":\"%s\"}",
      MT5AccountID,EscapeJson(reason));

   string response; int httpStatus;
   return HttpPost(body,response,httpStatus) && httpStatus>=200 && httpStatus<300;
}

bool SendStatus(const string errorText="")
{
   double balance=AccountInfoDouble(ACCOUNT_BALANCE);
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   int openTrades=PositionsTotal();
   double dailyPL=0.0;

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(),dt);
   dt.hour=0; dt.min=0; dt.sec=0;
   datetime dayStart=StructToTime(dt);

   if(HistorySelect(dayStart,TimeCurrent()))
   {
      uint total=HistoryDealsTotal();
      for(uint i=0;i<total;i++)
      {
         ulong ticket=HistoryDealGetTicket(i);
         if(ticket==0) continue;
         long entry=HistoryDealGetInteger(ticket,DEAL_ENTRY);
         if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_OUT_BY) continue;
         dailyPL+=HistoryDealGetDouble(ticket,DEAL_PROFIT);
         dailyPL+=HistoryDealGetDouble(ticket,DEAL_SWAP);
         dailyPL+=HistoryDealGetDouble(ticket,DEAL_COMMISSION);
      }
   }

   string body=StringFormat(
      "{\"action\":\"status\",\"account_id\":%I64d,\"connected\":true,\"running\":%s,\"balance\":%.8f,\"equity\":%.8f,\"daily_pl\":%.8f,\"open_trades\":%d,\"error\":\"%s\"}",
      MT5AccountID,localTradingAllowed ? "true" : "false",
      balance,equity,dailyPL,openTrades,EscapeJson(errorText));

   string response; int httpStatus;
   return HttpPost(body,response,httpStatus) && httpStatus>=200 && httpStatus<300;
}

void PollBridge()
{
   string body=StringFormat(
      "{\"action\":\"poll\",\"account_id\":%I64d}",MT5AccountID);

   string response; int httpStatus;
   if(!HttpPost(body,response,httpStatus))
   {
      SendStatus("Bridge connection failed");
      return;
   }

   if(httpStatus<200 || httpStatus>=300)
   {
      SendStatus("Bridge HTTP error "+IntegerToString(httpStatus));
      return;
   }

   string parts[];
   int count=StringSplit(response,'|',parts);
   if(count<=0) return;

   string action=parts[0];

   if(action=="STOP")
   {
      localTradingAllowed=false;
      SendStatus("Robot stopped by GoTradeX");
      return;
   }

   if(action=="RUN")
   {
      localTradingAllowed=true;
      SendStatus("");
      return;
   }

   if(action=="TRADE" && count>=10)
   {
      localTradingAllowed=true;

      long commandId=(long)StringToInteger(parts[1]);
      string symbol=parts[2];
      string direction=parts[3];
      double entry=StringToDouble(parts[4]);
      double sl=StringToDouble(parts[5]);
      double tp=StringToDouble(parts[6]);
      string risk=parts[8];
      double maxDD=StringToDouble(parts[9]);

      ExecuteTrade(commandId,symbol,direction,entry,sl,tp,risk,maxDD);
      SendStatus("");
      return;
   }

   if(action=="ERROR")
      SendStatus(response);
}

int OnInit()
{
   if(MT5AccountID<=0)
   {
      Print("Set MT5AccountID to your Exness MT5 login number.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(BotKey=="CHANGE_ME" || StringLen(BotKey)<16)
   {
      Print("Set BotKey before running the EA.");
      return INIT_PARAMETERS_INCORRECT;
   }

   peakEquity=AccountInfoDouble(ACCOUNT_EQUITY);
   localTradingAllowed=true;

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(30);

   EventSetTimer(MathMax(2,PollSeconds));
   SendStatus("");
   Print("GoTradeX Exness MT5 Bridge started. Account=",MT5AccountID);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   SendStatus("EA stopped or removed from chart");
}

void OnTimer()
{
   PollBridge();
}

void OnTick()
{
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity>peakEquity) peakEquity=equity;
}
