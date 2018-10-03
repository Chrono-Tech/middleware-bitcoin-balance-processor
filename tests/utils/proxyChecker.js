/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const amqp = require('amqplib'),
  _ =require('lodash'),
  config = require('../config');


const main = async () => {
    const package = require('../../package.json');
    const amqpInstance = await amqp.connect(config.systemRabbit.url);

    const channel = await amqpInstance.createChannel();
    _.map(package.requirements, async (r, k) => {
      await channel.assertQueue('test_block', {autoDelete: true, durable: false, noAck: true});
      await channel.bindQueue('test_block', config.systemRabbit.exchange, 
        `${config.systemRabbit.serviceName}.${k}.checking`);
      channel.consume('test_block', async msg => {
            if (!msg)
              return;
            const content = JSON.parse(msg.content);
            const version = content.version;
            await channel.publish(config.rabbit.exchange, 
              `${config.systemRabbit.serviceName}.${k}.checked`, new Buffer(JSON.stringify({version})));
      });
    });
};


module.exports = main().catch(err => {
  console.error(err);
  process.exit(0);
});
