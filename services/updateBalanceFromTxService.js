/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const getBalanceForAddress = require('../utils/getBalanceForAddress'),
  accountModel = require('../models/accountModel'),
  countTxBalanceDiff = require('../utils/countTxBalanceDiff'),
  BigNumber =require('bignumber.js'),
  _ = require('lodash');


const isUnconfirmedTransaction = blockHeight => blockHeight === -1;

const getBalanceFromTx = (tx, address) => {
  const diff = countTxBalanceDiff([tx], address);
  return  diff.positive - diff.negative;
};

const calculateBalance = async (initBalance, address, tx, blockHeight) => {
  //may be cache? 
  //return (initBalance === null) ? await getBalanceForAddress(address) : initBalance;
  
  const balance =  await getBalanceForAddress(address);
  if (isUnconfirmedTransaction(blockHeight))
    return new BigNumber(balance).plus(getBalanceFromTx(tx, address)).toNumber();
  return balance;
};

module.exports = async (address, blockHeight, txs) => {

  const account = await accountModel.findOne({address: address});
  if (!account)
    return;
  
  const initBalance = _.get(account, 'balances.confirmations0', null);
  const tx = _.last(txs);    
  const balance = await calculateBalance(initBalance, address, tx, blockHeight);

  if (balance === initBalance)
    return [];

  const updatedAccount = await accountModel.findOneAndUpdate({
    address: address
  }, {
    $set: {
      'balances.confirmations0': balance,
      lastBlockCheck: (blockHeight) ? blockHeight : -1
    }
  }, {new: true});

  return [{
    data: [{
      balances: updatedAccount.balances,
      tx: tx
    }],
    address: address
  }];
};
