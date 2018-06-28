/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const models = require('../../models'),
  Promise = require('bluebird'),
  BigNumber = require('bignumber.js'),
  _ = require('lodash');

const LIMIT = 10000;

const sumCoins = (coins) => {
  return _.chain(coins)
    .reduce((sum, coin) => {
      return sum.plus(coin.value);
    }, new BigNumber(0))
    .thru(bigNumber => bigNumber.toNumber())
    .value();
};

const sumNumbers = (sums) => {
  return _.chain(sums)
    .reduce((genSum, sum) =>
      genSum.plus(sum), new BigNumber(0))
    .thru(bigNumber => bigNumber.toNumber())
    .value();
};

module.exports = async (address, blockNumber) => {
  const condition = {address: address};

  blockNumber ?
    _.merge(condition, {
      outputBlock: {$lte: blockNumber},
      $or: [
        {inputBlock: {$exists: false}},
        {inputBlock: {$gt: blockNumber}}
      ]
    }) : _.merge(condition, {inputBlock: {$exists: false}});


  const countCoins = await models.coinModel.count(condition);

  const sums = await Promise.mapSeries(_.range(0, countCoins, LIMIT), async startCoin => {
    const coins = await models.coinModel.find(condition).select('value').skip(startCoin).limit(LIMIT);
    return sumCoins(coins);
  });

  return sumNumbers(sums);
};
