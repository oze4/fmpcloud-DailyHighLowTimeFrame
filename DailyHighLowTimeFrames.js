const fetch = require("node-fetch");
const fs = require('fs');
const { parse } = require("json2csv");

/**
 * 
 * Main
 * 
 */

(async () => {
  const apiKey = "";
  const symbol = "TSLA";
  const from = "2021-06-7";
  const to = "2021-06-18";
  const timeframe = "15mmin";

  let lows = await inWhichTimespanDidLowOccur(apiKey, timeframe, symbol, from, to);
  let highs = await inWhichTimespanDidHighOccur(apiKey, timeframe, symbol, from, to);

  const result = lows.map(low => {
    const { timespan, ...copy } = low;
    const high = highs.find(h => String(h.timespan.date).startsWith(String(timespan.date).split(" ")[0]));
    return { 
      ...copy, 
      lowTimeFrame: timespan.date, 
      lowTimeFramePrice: timespan.low,
      highTimeFrame: high.timespan.date,
      highTimeFramePrice: high.timespan.high
    }
  });

  const fields = Object.keys(result[0]);
  const csv = parse(result, { fields });
  fs.writeFile('highlow.csv', csv, (err) => {
    if (err) return console.error(err);
    console.log('.csv saved');
  });
})();

/**
 * 
 * Helper funcs
 * 
 */

/**
 * Returns the high point of the day with daily statistics. This allows you to see at which time
 * the high normally occurs. 
 *
 * @param {string} apiKey fmpcloud.io API key
 * @param {string} timeframe Timeframe. Must be one of : ("1min" | "5min" | "15min" | "30min" | "1hour")
 * @param {string} symbol Ticker symbol
 * @param {string} from Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be less than `to` param.
 * @param {string} to Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be greater than `from` param.
 */
async function inWhichTimespanDidHighOccur(apiKey, timeframe = "1hour", symbol, from, to) {
  panicIfInvalidTimeFrame(timeframe);
  const dailyHL = await getDailyHighLow(apiKey, symbol, from, to);
  const url = `https://fmpcloud.io/api/v3/historical-chart/${timeframe}/${symbol.toUpperCase()}?from=${from}&to=${to}&apikey=${apiKey}`;
  const resp = await fetch(url);
  const intradayArr = await resp.json();

  return dailyHL.map((daily) => {
    // Filter to find all intraday stats by date
    const intraday = intradayArr.filter((i) => String(i.date).startsWith(String(daily.date)));
    // Find the hour that had the daily low for that day
    let found = intraday.find((id) => Number(id.low).toFixed(2) <= Number(daily.low).toFixed(2));
    // Since fmpcloud.io will sometimes return data that has a daily high/low listed as X,
    // but when you get hourly data for that day, the high/low will be listed as Y. 
    // This means we just find the lowest low in the intraday data if the daily high/low
    // does not match up with any intraday "candle" low.
    if (!found) {
      // This grabs the low from each intraday "candle" and turns it into an array of numbers.
      const highestIntraday = Number(Math.max.apply(Math, intraday.map(id => id.high))).toFixed(2);
      // Since all we have now is the lowest low (just the number) we still want all of those props
      // from the intraday object. So we find it based upon that "candle.low" number we already have.
      found = intraday.find(id => Number(id.high).toFixed(2) === highestIntraday);
    } 

    return { 
      ...daily, 
      timespan: { ...found, timeframe } 
    };
  });
}

/**
 * Returns the low point of the day with daily statistics. This allows you to see at which time
 * the low normally occurs. In 30 min increments. If the low was at 9:45, we would return the
 * timespan starting at 9:30.
 *
 * @param {string} apiKey fmpcloud.io API key
 * @param {string} timeframe Timeframe. Must be one of : ("1min" | "5min" | "15min" | "30min" | "1hour")
 * @param {string} symbol Ticker symbol
 * @param {string} from Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be less than `to` param.
 * @param {string} to Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be greater than `from` param.
 */
async function inWhichTimespanDidLowOccur(apiKey, timeframe = "1hour", symbol, from, to) {
  panicIfInvalidTimeFrame(timeframe);
  const dailyHL = await getDailyHighLow(apiKey, symbol, from, to);
  const url = `https://fmpcloud.io/api/v3/historical-chart/${timeframe}/${symbol.toUpperCase()}?from=${from}&to=${to}&apikey=${apiKey}`;
  const resp = await fetch(url);
  const intradays = await resp.json();
  
  return dailyHL.map((daily) => {
    // Filter to find all intraday stats by date
    const intraday = intradays.filter((i) => String(i.date).startsWith(String(daily.date)));
    // Find the hour that had the daily low for that day
    let found = intraday.find((i) => i.low <= daily.low);
    // Since fmpcloud.io will sometimes return data that has a daily high/low listed as X,
    // but when you get hourly data for that day, the high/low will be listed as Y. 
    // This means we just find the lowest low in the intraday data if the daily high/low
    // does not match up with any intraday "candle" low.
    if (!found) {
      // This grabs the low from each intraday "candle" and turns it into an array of numbers.
      const lowestIntraday = Number(Math.min.apply(Math, intraday.map(id => id.low))).toFixed(2);
      // Since all we have now is the lowest low (just the number) we still want all of those props
      // from the intraday object. So we find it based upon that "candle.low" number we already have.
      found = intraday.find(id => Number(id.low).toFixed(2) === lowestIntraday);
    } 

    return { 
      ...daily, 
      timespan: { ...found, timeframe } 
    };
  });
}

/**
 *
 * @param {string} apiKey fmpcloud.io API key
 * @param {string} symbol Ticker symbol
 * @param {string} from Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be less than `to` param.
 * @param {string} to Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be greater than `from` param.
 * @param {number} hourOfDay 0-24 by hour, in military time (13 is 1pm, etc..).
 */
async function getPriceFromTimeOfDay(apiKey, symbol, from, to, hourOfDay = 0) {
  if (hourOfDay < 0 || hourOfDay > 24) {
    throw new Error("[getPriceFromTimeOfDay] : Error : Invalid timeOfDay! Must be 0-24");
  }
  const url = `https://fmpcloud.io/api/v3/historical-chart/1hour/${symbol.toUpperCase()}?from=${from}&to=${to}&apikey=${apiKey}`;
  const resp = await fetch(url);
  const json = await resp.json();
  // If we are given 5, turn it into 05
  const hrs = hourOfDay.length === 1 ? "0" + hourOfDay : hourOfDay;
  return json.filter((s) => String(s.date).endsWith(`${hrs}:00:00`));
}

/**
 *
 * @param {string} apiKey fmpcloud.io API key
 * @param {string} symbol Ticker symbol
 * @param {string} from Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be less than `to` param.
 * @param {string} to Date. HAS to be in YYYY-MM-DD format. ex: 1990-01-29. Should be greater than `from` param.
 */
async function getDailyHighLow(apiKey, symbol, from, to) {
  try {
    const url = `https://fmpcloud.io/api/v3/historical-price-full/${symbol}?from=${from}&to=${to}&apikey=${apiKey}`;
    const resp = await fetch(url);
    const json = await resp.json();
    return json.historical;
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
}

/**
 * Validates given timeframe string
 * @param {*} timeframe 
 */
function isValidTimeFrame(timeframe = undefined) {
  if (timeframe === undefined) {
    return false;
  }
  const timeframes = ["1min", "5min", "15min", "30min", "1hour"];
  return timeframes.includes(timeframe) === true;
}

function panicIfInvalidTimeFrame(timeframe) {
  if (!isValidTimeFrame(timeframe)) {
    throw new Error('Invalid timeframe! Should be one of : "1min", "5min", "15min", "30min", "1hour"');
  }
}