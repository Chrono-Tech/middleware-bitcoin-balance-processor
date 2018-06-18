/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const _ = require('lodash'),
  Promise = require('bluebird'),
  txModel = require('../models/txModel'),
  accountModel = require('../models/accountModel'),
  getBalanceForAddress = require('../utils/getBalanceForAddress'),
  coinModel = require('../models/coinModel');

/**
 *
 * @param {Number} blockHeight
 * @returns {<AccountModel>Array}
 */
module.exports = async (blockHeight) => {

  const getTxHash = async (blockNumber, index) => {
    const tx = await txModel.findOne({blockNumber, index}).select('_id');
    return tx ? tx._id : null;
  };


  //get coins received between 3 and 6 confirmations
  const condition = { outputBlock: {$in: [blockHeight - 2, blockHeight - 5]} };

  const lastConfirmedCoins = await coinModel.find(condition);

  const addressInCoins = _.groupBy(lastConfirmedCoins, 'address');

  const balanceChanges = await Promise.mapSeries(_.toPairs(addressInCoins), async item => {
    let result = {
      address: item[0],
      balances: {},
      txs: []
    };

    let coins = item[1];

    let coinsByConfirmations3 = _.filter(coins, {outputBlock: blockHeight - 2});
    let coinsByConfirmations6 = _.filter(coins, {outputBlock: blockHeight - 5});

    if (!coinsByConfirmations3 && !coinsByConfirmations6)
      return;

    const accountExist = await accountModel.count({address: result.address});
    if (!accountExist)
      return;


    if (coinsByConfirmations3.length) {
      result.balances['balances.confirmations3'] = await getBalanceForAddress(result.address, blockHeight - 2);
      let confirmation3Txs = await Promise.map(coinsByConfirmations3, async coin => await getTxHash(coin.outputBlock, coin.outputTxIndex));
      result.txs.push(..._.compact(confirmation3Txs));
    }

    if (coinsByConfirmations6.length) {
      result.balances['balances.confirmations6'] = await getBalanceForAddress(result.address, blockHeight - 5);
      let confirmation6Txs = await Promise.map(coinsByConfirmations6, async coin => await getTxHash(coin.outputBlock, coin.outputTxIndex));
      result.txs.push(..._.compact(confirmation6Txs));
    }

    return result;
  });


  return _.compact(balanceChanges);
};
