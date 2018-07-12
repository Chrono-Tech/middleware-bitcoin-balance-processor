const _ = require('lodash'),
  models = require('../../models');

/**
 * @function
 * @description build full transaction object
 * @param blockNumber - the transaction's block number
 * @param index - the transaction's index in block
 * @return {Promise<*>}
 */
module.exports = async (blockNumber, index) => {

  let tx = await models.txModel.findOne({blockNumber: blockNumber, index: index});

  if (!tx)
    return;

  tx = tx.toObject();

  let lastBlock = await models.blockModel.find({}).sort({number: -1}).limit(1);
  lastBlock = _.get(lastBlock, '0.number');


  let coins = await models.coinModel.find({
    $or: [
      {inputBlock: tx.blockNumber, inputTxIndex: tx.index},
      {outputBlock: tx.blockNumber, outputTxIndex: tx.index}
    ]
  });


  tx.hash = tx._id;
  tx.inputs = _.chain(coins)
    .filter({inputBlock: tx.blockNumber, inputTxIndex: tx.index})
    .orderBy('inputIndex')
    .map(coin => ({
      address: coin.address,
      value: coin.value
    }))
    .value();

  tx.outputs = _.chain(coins)
    .filter({outputBlock: tx.blockNumber, outputTxIndex: tx.index})
    .orderBy('outputIndex')
    .map(coin => ({
      address: coin.address,
      value: coin.value
    }))
    .value();

  tx.confirmations = tx.blockNumber === -1 ? 0 : (lastBlock || tx.blockNumber - 2) - tx.blockNumber + 1;

  delete tx._id;
  delete tx.__v;

  return tx;

};