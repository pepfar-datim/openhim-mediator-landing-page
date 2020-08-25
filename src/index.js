require('./init');

const logger = require('winston');
const config = require('./config');

const express = require('express');
const bodyParser = require('body-parser');
const mediatorUtils = require('openhim-mediator-utils');
const util = require('./util');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;

const buildArgs = function(script) {
  const args = [];

  if (script.arguments) {
    for (let cArg in script.arguments) {
      args.push(cArg);
      if (script.arguments[cArg]) {
        args.push(script.arguments[cArg]);
      }
    }
  }

  return args;
};

const setupEnv = function(script) {
  let env;
  if (script.env) {
    let k;
    env = {};
    for (k in process.env) {
      env[k] = process.env[k];
    }
    for (k in script.env) {
      env[k] = script.env[k];
    }
    return env;
  } else {
    return process.env;
  }
};


const handler = script => function (req, res) {
  let cmd, format, period,contenttype, outputcsv, out="";
  const openhimTransactionID = req.headers['x-openhim-transactionid'];
  if (req.query.format) {
    format=req.query.format
  } else {
    format = 'json';
  }
  format = format.toLowerCase();
  if (format === 'json') {
    contenttype = 'application/json';
  }
  else if (format === 'html') {
    contenttype = 'text/html';
  }
  else if (format === 'xml') {
    contenttype = 'application/xml';
  }
  else if (format === 'csv') {
    contenttype = 'application/csv';
  }
  else {
    /*default to json*/
    format = "json";
    contenttype = 'application/json';
  }
  const scriptCmd = path.join(config.getConf().scriptsDirectory, script.filename);
  const args = buildArgs(script);
  if(req.params.collection) {
    args.push(("--repo"));
    args.push((req.params.collection));
    outputcsv=req.params.collection;
  }
  else if(req.query.dataElements) {
    args.push(("--dataelements"));
    args.push((req.query.dataElements));
    outputcsv="mspDataElements";
  }
  else {
    outputcsv='datim-MOH'+req.params.period;
  }
  args.push(("--format"));
  args.push(format);
  if(req.params.period) {
    period=req.params.period;
  }
  else if (req.query.period){
    period=req.query.period;
  }
  if (period){
    args.push(("--period"));
    args.push((period));
  }
  args.unshift(scriptCmd);
  logger.info(`[${args}]}`);
  cmd = spawn('/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', args);
  logger.info(`[${openhimTransactionID}] Executing ${scriptCmd} ${args.join(' ')}`);
  const appendToOut = data => out = `${out}${data}`;
  cmd.stdout.on('data', appendToOut);
  cmd.stderr.on('data', appendToOut);

  res.set('Access-Control-Allow-Origin', '*');
  return cmd.on('close', function(code) {
    logger.info(`[${openhimTransactionID}] Script exited with status ${code}`);

    if (format) {
      res.set('Content-Type', contenttype);
      if (format === 'csv') {
        res.set('Content-Disposition', 'inline; filename="'+outputcsv+'.csv"');
      }
    }
    return res.send (out);
});
}

let app = null
let server = null

const getAvailableScripts = callback => fs.readdir(config.getConf().scriptsDirectory, callback);

const isScriptNameValid = name => !((name.length === 0) || (name[0] === '.') || (name.indexOf('/') > -1) || (name.indexOf('\\') > -1));

const startExpress = () => getAvailableScripts(function(err, scriptNames) {
  if (err) {
    logger.error(err);
    process.exit(1);
  }

  logger.info(`Available scripts: ${(scriptNames.filter(d => !d.startsWith('.'))).join(', ')}`);

  app = express();
  app.use(bodyParser.json());
  app.disable('etag');

  if (config.getConf().scripts) {
    for (let script of Array.from(config.getConf().scripts)) {
      (function(script) {
        if (isScriptNameValid(script.filename) && Array.from(scriptNames).includes(script.filename)) {
          app.get(script.endpoint, handler(script));
          return logger.info(`Initialized endpoint '${script.endpoint}' for script '${script.filename}'`);
        } else {
          logger.warn(`Invalid script name specified '${script.filename}'`);
          return logger.warn(`Check that this script is located in the scripts directory '${config.getConf().scriptsDirectory}'`);
        }
      })(script);
    }
  }

  server = app.listen(config.getConf().server.port, config.getConf().server.hostname, () => logger.info(`[${process.env.NODE_ENV}] ${config.getMediatorConf().name} running on port ${server.address().address}:${server.address().port}`));
  return server.timeout = 0;
});

const restartExpress = function() {
  if (server) {
    logger.info("Re-initializing express server ...");
    server.close(); // existing connection will still be processed async
    return startExpress(); // start server with new config
  }
};


const debugLogConfig = function() {
  if (config.getConf().logger.level === 'debug') {
    logger.debug('Full config:');
    return logger.debug(JSON.stringify(config.getConf(), null, '  '));
  }
};


if (process.env.NODE_ENV !== 'test') {
  logger.info('Attempting to register mediator with core ...');
  config.getConf().openhim.api.urn = config.getMediatorConf().urn;

  mediatorUtils.registerMediator(config.getConf().openhim.api, config.getMediatorConf(), function(err) {
    if (err) {
      logger.error(err);
      process.exit(1);
    }

    logger.info('Mediator has been successfully registered');

    const configEmitter = mediatorUtils.activateHeartbeat(config.getConf().openhim.api);

    configEmitter.on('config', function(newConfig) {
      logger.info('Received updated config from core');
      config.updateConf(newConfig);
      debugLogConfig();
      return restartExpress();
    });

    configEmitter.on('error', err => logger.error(err));

    return mediatorUtils.fetchConfig(config.getConf().openhim.api, function(err, newConfig) {
      if (err) { return logger.error(err); }
      logger.info('Received initial config from core');
      config.updateConf(newConfig);
      debugLogConfig();
      return startExpress();
    });
  });
}


exports.app = app;
