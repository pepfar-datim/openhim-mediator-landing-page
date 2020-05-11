/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
require('./init');

const logger = require('winston');
const config = require('./config');

const express = require('express');
const bodyParser = require('body-parser');
const mediatorUtils = require('openhim-mediator-utils');
const util = require('./util');
const fs = require('fs');
const path = require('path');
const {
  spawn
} = require('child_process');

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


const handler = script => (function(req, res) {
  let cmd, exclude_empty_maps, format, include_extra_info, period, verbosity;
  const openhimTransactionID = req.headers['x-openhim-transactionid'];
  let responseHasBeenSent = false;
  if (!req.query.format) {
    format = 'csv';
  } else {
    ({
      format
    } = req.query);
  }
  try {
    format = format.toLowerCase();
  } catch (e) {  
    responseHasBeenSent = true;
    res.send("Undefined Collection");  
  }
  let contenttype = '';
  if (format === 'json') {
    contenttype = 'application/json';
  }
  if (format === 'html') {
    contenttype = 'text/html';
  }
  if (format === 'xml') {
    contenttype = 'application/xml';
  }
  if (format === 'csv') {
    contenttype = 'application/csv';
  }
  const {
    collection
  } = req.query;
  const {
    country_code
  } = req.query;
  if (!req.query.period) {
    period= "default";
  } else {
    ({
      period
    } = req.query);
  }
  if (!req.query.verbosity) {
    verbosity= 0;
  } else {
    ({
      verbosity
    } = req.query);
  }
  if (!req.query.exclude_empty_maps) {
    exclude_empty_maps='true';
  } else {
    ({
      exclude_empty_maps
    } = req.query);
  }
  if (!req.query.include_extra_info) {
    include_extra_info='false';
  } else {
    ({
      include_extra_info
    } = req.query);
  }
  const {
    import_task_id
  } = req.query;
  const scriptCmd = path.join(config.getConf().scriptsDirectory, script.filename);
  const args = buildArgs(script);
  let argsFromRequest = [format, collection];
  if ((collection == null)) {
     argsFromRequest = [country_code,format,period,verbosity,exclude_empty_maps,include_extra_info];
   }
  //cmd = spawn scriptCmd, args, env: setupEnv(script)
  if (req.path === '/datim-imap-status') {
    argsFromRequest = [scriptCmd, import_task_id];
    cmd = spawn('/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', argsFromRequest);
  } else if (req.path === '/datim-moh') {
      argsFromRequest = [scriptCmd, format, period];
      cmd = spawn('/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', argsFromRequest);
  //else if req.path == '/show-msp'
      //argsFromRequest = [scriptCmd, format, period]
     // cmd = spawn 'pipenv run python', argsFromRequest
  } else { 
    let i = 0;
    while (i < args.length) {
      if (args[i] === '--format') {
        args[i + 1] = format;
      }
      i++;
    }
    if (collection) {
      i = 0;
      while (i < args.length) {
        if (args[i] === '--repo') {
          args[i + 1] = collection;
        }
        i++;
      }
    }
    if (period) {
      i = 0;
      while (i < args.length) {
        if (args[i] === '--period') {
          args[i + 1] = period;
        }
        i++;
      }
    }
    if (country_code) {
      i = 0;
      while (i < args.length) {
        if (args[i] === '--country_code') {
          args[i + 1] = country_code;
        }
        i++;
      }
    } else if (req.query.dataElements) {
      i = args.indexOf('--repo');
      args.splice(i,2);
      i = 0;
      args.push(("--dataelements"));
      args.push((req.query.dataElements));
    }
    args.unshift(scriptCmd);
    logger.info(`[${args}]}`);
    cmd = spawn('/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', args);
  }
   // cmd = spawn scriptCmd, argsFromRequest
  logger.info(`[${openhimTransactionID}] Executing ${scriptCmd} ${args.join(' ')}`);
  logger.info(`Format is ${format} and collection is ${collection}`);

  let out = "";
  const appendToOut = data => out = `${out}${data}`;
  cmd.stdout.on('data', appendToOut);
  cmd.stderr.on('data', appendToOut);
  
  res.set('Access-Control-Allow-Origin', '*');
  return cmd.on('close', function(code) {
    logger.info(`[${openhimTransactionID}] Script exited with status ${code}`);
    //res.set 'Content-Type', 'application/json+openhim'

    if (req.path === '/datim-imap-export') {
      if (!req.query.country_code) {
        res.set('Content-Type', 'application/json+openhim');
        responseHasBeenSent = true;
        res.send({
          'x-mediator-urn': config.getMediatorConf().urn,
          status: 'Failed',
          response: {
            status: 400,
            headers: {
              'content-type': 'text/plain',
              'Access-Control-Allow-Origin' : '*'
            },
            body: "country_code is a required parameter",
            timestamp: new Date()
          }
        });
      }
      /*try
        outputObject = JSON.parse(out)
        if typeof outputObject.status_code != 'undefined'
          if outputObject.status_code == 409
            res.set 'Content-Type', 'application/json+openhim'
            responseHasBeenSent = true
            res.send {
              'x-mediator-urn': config.getMediatorConf().urn
              status: 'Failed'
              response:
                status: outputObject.status_code
                headers:
                  'content-type': 'text/plain'
                  'Access-Control-Allow-Origin' : '*'
                body: out
                timestamp: new Date()
            }
      catch e
        res.set 'Content-Type', 'application/json+openhim'
        responseHasBeenSent = true
        res.send {
          'x-mediator-urn': config.getMediatorConf().urn
          status: 'Failed'
          response:
            status: 404
            headers:
              'content-type': 'text/plain'
              'Access-Control-Allow-Origin' : '*'
            body: out
            timestamp: new Date()
        }*/
    }
    if (req.path === '/datim-imap-status') {

      const outputObject = JSON.parse(out);
      res.set('Content-Type', 'application/json+openhim');
      responseHasBeenSent = true;
      res.send({
        'x-mediator-urn': config.getMediatorConf().urn,
        status: (outputObject.status_code === 200) || (outputObject.status_code === 202) ? 'Successful' : 'Failed',
        response: {
          status: outputObject.status_code,
          headers: {
            'content-type': 'text/plain',
            'Access-Control-Allow-Origin' : '*'
          },
          body: outputObject.result,
          timestamp: new Date()
        }
      });
    }
    if (responseHasBeenSent === false) {
      res.set('Content-Type', contenttype);
      if (format === 'csv') {
        res.set('Content-Disposition', 'inline; filename="'+collection+'.csv"'); 
      }
      return res.send(out);
    }
  });
});

    


// Express

let app = null;
let server = null;


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
