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


  const lastConfirmedCoins = await models.coinModel.find({outputBlock: {$in: [blockHeight - 2, blockHeight - 5]}});

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

    let outputsConfirmations3 = _.chain(coins).filter({outputBlock: blockHeight - 2})
      .map(coin => ({outputBlock: coin.outputBlock, outputTxIndex: coin.outputTxIndex}))
      .uniqWith(_.isEqual)
      .value();

    let outputsConfirmations6 = _.chain(coins).filter({outputBlock: blockHeight - 5})
      .map(coin => ({outputBlock: coin.outputBlock, outputTxIndex: coin.outputTxIndex}))
      .uniqWith(_.isEqual)
      .value();

    if (!outputsConfirmations3 && !outputsConfirmations6)
      return;

    if (outputsConfirmations3.length) {
      result.balances.confirmations3 = await getBalance(result.address, blockHeight - 2);
      let confirmation3Txs = await Promise.map(outputsConfirmations3, async coin => await getFullTxFromCache(coin.outputBlock, coin.outputTxIndex));
      result.txs.push(..._.compact(confirmation3Txs));
    }

    if (outputsConfirmations6.length) {
      result.balances.confirmations6 = await getBalance(result.address, blockHeight - 5);
      let confirmation6Txs = await Promise.map(outputsConfirmations6, async coin => await getFullTxFromCache(coin.outputBlock, coin.outputTxIndex));
      result.txs.push(..._.compact(confirmation6Txs));
    }

    return result;
  });


  return {
    data: _.chain(balanceChanges)
      .compact()
      .map(item =>
        item.txs.map(tx=>({
          tx: tx,
          balances: item.balances,
          address: item.address
        }))
      )
      .flattenDeep()
      .value()
  };


};
