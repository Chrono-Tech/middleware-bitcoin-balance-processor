/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const Promise = require('bluebird'),
  getBalance = require('./getBalance'),
  getFullTxFromCache = require('../tx/getFullTxFromCache'),
  models = require('../../models'),
  _ = require('lodash');

/**
 * @function
 * @description find all addresses, calc their balances and also
 * find their txs on 3 and 6 confirmations from the specified block height
 * @param blockHeight - the current block number
 * @return {Promise<Array>}
 */
module.exports = async (blockHeight) => {

  let lastConfirmedCoins = await models.coinModel.find({
    $or: [
      {outputBlock: {$in: [blockHeight - 2, blockHeight - 5]}},
      {inputBlock: {$in: [blockHeight - 2, blockHeight - 5]}}
    ]

  });

  lastConfirmedCoins = lastConfirmedCoins.map(coin => {

    if (![blockHeight - 2, blockHeight - 5].includes(coin.outputBlock))
      return {
        block: coin.inputBlock,
        index: coin.inputTxIndex,
        address: coin.address
      };

    return {
      block: coin.outputBlock,
      index: coin.outputTxIndex,
      address: coin.address
    };
  });

  const addressInCoins = _.groupBy(lastConfirmedCoins, 'address');

  const balanceChanges = await Promise.mapSeries(_.toPairs(addressInCoins), async item => {
    let result = {
      address: item[0],
      balances: {},
      txs: []
    };

    const accountExist = await models.accountModel.count({address: result.address});
    if (!accountExist)
      return;

    let coins = item[1];

    let outputsConfirmations3 = _.chain(coins).filter({block: blockHeight - 2})
      .map(coin => ({block: coin.block, index: coin.index}))
      .uniqWith(_.isEqual)
      .value();

    let outputsConfirmations6 = _.chain(coins).filter({block: blockHeight - 5})
      .map(coin => ({block: coin.block, index: coin.index}))
      .uniqWith(_.isEqual)
      .value();

    result.balances.confirmations0 = await getBalance(result.address);


    if (!outputsConfirmations3 && !outputsConfirmations6)
      return result;

    if (outputsConfirmations3.length) {
      result.balances.confirmations3 = await getBalance(result.address, blockHeight - 2);
      let confirmation3Txs = await Promise.map(outputsConfirmations3, async coin => await getFullTxFromCache(coin.block, coin.index));
      result.txs.push(..._.compact(confirmation3Txs));
    }

    if (outputsConfirmations6.length) {
      result.balances.confirmations6 = await getBalance(result.address, blockHeight - 5);
      let confirmation6Txs = await Promise.map(outputsConfirmations6, async coin => await getFullTxFromCache(coin.block, coin.index));
      result.txs.push(..._.compact(confirmation6Txs));
    }

    return result;
  });


  return _.chain(balanceChanges)
    .compact()
    .transform((result, item) =>
      result.push({
        address: item.address,
        data: _.map(item.txs, tx => _.merge({}, {tx: tx, balances: item.balances}))
      }), []
    ).value();


};
