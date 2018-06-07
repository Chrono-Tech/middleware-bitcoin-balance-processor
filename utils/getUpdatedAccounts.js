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
  getGroupCoinsForBlocks = require('../utils/getGroupCoinsForBlocks');

/**
 * 
 * @param {Number} blockHeight 
 * @returns {Array of accountModel}
 */
module.exports = async blockHeight => {

  const getConfirmationsKey = (outputBlock) => {
    const blockConfirmations = blockHeight - outputBlock +1;
    return 'balances.confirmations' + blockConfirmations;
  };

  const txHashes = {};
  const getTxHashOnlyOneForAddress = async (address, blockNumber, index) => {
    if (!txHashes[address]) {
      const tx = await txModel.findOne({blockNumber, index}, {$select: '_id'});
      if (!tx)
        return;
      txHashes[address] = tx._id;
    }
    return txHashes[address];
  };

  const accounts = {};
  const getAccount = async (address) => {
    if (!accounts[address]) {
      const account = await accountModel.findOne({address: address});
      if (!account) return;
      accounts[address] = account;
    }
    return accounts[address];
  };
  const groupCoins = await getGroupCoinsForBlocks([blockHeight-2, blockHeight-5]);   
  
  
  await Promise.mapSeries(groupCoins, async groupCoin => {
    const account = await getAccount(groupCoin.address);
    if (!account)
      return;

    
    const confirmationsKey = getConfirmationsKey(groupCoin.outputBlock),
      value = await getBalanceForAddress(groupCoin.address, groupCoin.outputBlock+1);

    _.set(account, confirmationsKey, value);
    account['tx'] = await getTxHashOnlyOneForAddress(groupCoin.address, groupCoin.outputBlock, groupCoin.outputTxIndex);
  });


  return _.values(accounts);
};
