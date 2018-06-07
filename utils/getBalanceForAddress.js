/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const coinModel = require('../models/coinModel'),
  Promise = require('bluebird'),
  BigNumber = require('bignumber.js'),
  _ = require('lodash');

const LIMIT = 10000;

const sumCoins = (coins) => {
  return _.reduce(coins, (sum, coin) => {
    return sum.plus(coin.value);
  }, new BigNumber(0));
};

const sumNumbers = (sums) => {
  return _.reduce(sums, (genSum, sum) => genSum.plus(sum), new BigNumber(0));
};

module.exports = async (address, blockNumber) => {
  const condition = {address, inputBlock: {$exists: false}};
  if (blockNumber)
    condition['outputBlock'] = {$lt: blockNumber};
  const countCoins = await coinModel.count(condition);
  
  const sums = await Promise.mapSeries(_.range(0, countCoins, LIMIT), async startCoin => {
    const coins = await coinModel.find(condition).skip(startCoin).limit(LIMIT);
    return sumCoins(coins);  
  });

  return  sumNumbers(sums);
};
