require './init'

logger = require 'winston'
config = require './config'

express = require 'express'
bodyParser = require 'body-parser'
mediatorUtils = require 'openhim-mediator-utils'
util = require './util'
fs = require 'fs'
path = require 'path'
spawn = require('child_process').spawn

buildArgs = (script) ->
  args = []

  if script.arguments
    for cArg of script.arguments
      args.push cArg
      if script.arguments[cArg]
        args.push script.arguments[cArg]

  return args

setupEnv = (script) ->
  if script.env
    env = {}
    for k of process.env
      env[k] = process.env[k]
    for k of script.env
      env[k] = script.env[k]
    env
  else
    process.env


handler = (script) -> (req, res) ->
  openhimTransactionID = req.headers['x-openhim-transactionid']
  responseHasBeenSent = false
  unless req.query.format
    format = 'csv'
  else
    format = req.query.format
  try
    format = format.toLowerCase()
  catch e  
    responseHasBeenSent = true
    res.send "Undefined Collection"  
  contenttype = ''
  if format == 'json'
    contenttype = 'application/json'
  if format == 'html'
    contenttype = 'text/html'
  if format == 'xml'
    contenttype = 'application/xml'
  if format == 'csv'
    contenttype = 'application/csv'
  collection= req.query.collection
  country_code= req.query.country_code
  unless req.query.period
    period= "default"
  else
    period= req.query.period
  unless req.query.verbosity
    verbosity= 0
  else
    verbosity= req.query.verbosity
  unless req.query.exclude_empty_maps
    exclude_empty_maps='true'
  else
    exclude_empty_maps= req.query.exclude_empty_maps
  unless req.query.include_extra_info
    include_extra_info='false'
  else
    include_extra_info= req.query.include_extra_info
  import_task_id= req.query.import_task_id
  scriptCmd = path.join config.getConf().scriptsDirectory, script.filename
  args = buildArgs script
  argsFromRequest = [format, collection]
  if !collection?
     argsFromRequest = [country_code,format,period,verbosity,exclude_empty_maps,include_extra_info]
  #cmd = spawn scriptCmd, args, env: setupEnv(script)
  if req.path == '/datim-imap-status'
    argsFromRequest = [scriptCmd, import_task_id]
    cmd = spawn '/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', argsFromRequest
  else if req.path == '/datim-moh'
      argsFromRequest = [scriptCmd, format, period]
      cmd = spawn '/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', argsFromRequest
  #else if req.path == '/show-msp'
      #argsFromRequest = [scriptCmd, format, period]
     # cmd = spawn 'pipenv run python', argsFromRequest
  else 
    i = 0
    while i < args.length
      if args[i] == '--format'
        args[i + 1] = format
      i++
    if collection
      i = 0
      while i < args.length
        if args[i] == '--repo'
          args[i + 1] = collection
        i++
    if period
      i = 0
      while i < args.length
        if args[i] == '--period'
          args[i + 1] = period
        i++
    if country_code
      i = 0
      while i < args.length
        if args[i] == '--country_code'
          args[i + 1] = country_code
        i++
    else if req.query.dataElements
      i = args.indexOf '--repo'
      args.splice i,2
      i = 0
      args.push ("--dataelements")
      args.push (req.query.dataElements)
    args.unshift scriptCmd
    logger.info "[#{args}]}"
    cmd = spawn '/home/openhim-core/.local/share/virtualenvs/ocl_datim-viNFXhy9/bin/python', args
   # cmd = spawn scriptCmd, argsFromRequest
  logger.info "[#{openhimTransactionID}] Executing #{scriptCmd} #{args.join ' '}"
  logger.info "Format is #{format} and collection is #{collection}"

  out = ""
  appendToOut = (data) -> out = "#{out}#{data}"
  cmd.stdout.on 'data', appendToOut
  cmd.stderr.on 'data', appendToOut
  
  res.set 'Access-Control-Allow-Origin', '*'
  cmd.on 'close', (code) ->
    logger.info "[#{openhimTransactionID}] Script exited with status #{code}"
    #res.set 'Content-Type', 'application/json+openhim'

    if req.path == '/datim-imap-export'
      unless req.query.country_code
        res.set 'Content-Type', 'application/json+openhim'
        responseHasBeenSent = true
        res.send {
          'x-mediator-urn': config.getMediatorConf().urn
          status: 'Failed'
          response:
            status: 400
            headers:
              'content-type': 'text/plain'
              'Access-Control-Allow-Origin' : '*'
            body: "country_code is a required parameter"
            timestamp: new Date()
        }
      ###try
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
        }###
    if req.path == '/datim-imap-status'

      outputObject = JSON.parse(out)
      res.set 'Content-Type', 'application/json+openhim'
      responseHasBeenSent = true
      res.send {
        'x-mediator-urn': config.getMediatorConf().urn
        status: if outputObject.status_code == 200 or outputObject.status_code == 202 then 'Successful' else 'Failed'
        response:
          status: outputObject.status_code
          headers:
            'content-type': 'text/plain'
            'Access-Control-Allow-Origin' : '*'
          body: outputObject.result
          timestamp: new Date()
      }
    if responseHasBeenSent == false
      res.set 'Content-Type', contenttype
      if format == 'csv'
        res.set 'Content-Disposition', 'inline; filename="'+collection+'.csv"' 
      res.send out

    


# Express

app = null
server = null


getAvailableScripts = (callback) -> fs.readdir config.getConf().scriptsDirectory, callback

isScriptNameValid = (name) -> not (name.length is 0 or name[0] is '.' or name.indexOf('/') > -1 or name.indexOf('\\') > -1)

startExpress = ->
  getAvailableScripts (err, scriptNames) ->
    if err
      logger.error err
      process.exit 1

    logger.info "Available scripts: #{(scriptNames.filter (d) -> not d.startsWith '.').join ', '}"

    app = express()
    app.use bodyParser.json()
    app.disable('etag')

    if config.getConf().scripts
      for script in config.getConf().scripts
        do (script) ->
          if isScriptNameValid(script.filename) and script.filename in scriptNames
            app.get script.endpoint, handler(script)
            logger.info "Initialized endpoint '#{script.endpoint}' for script '#{script.filename}'"
          else
            logger.warn "Invalid script name specified '#{script.filename}'"
            logger.warn "Check that this script is located in the scripts directory '#{config.getConf().scriptsDirectory}'"

    server = app.listen config.getConf().server.port, config.getConf().server.hostname, ->
      logger.info "[#{process.env.NODE_ENV}] #{config.getMediatorConf().name} running on port #{server.address().address}:#{server.address().port}"
    server.timeout = 0

restartExpress = ->
  if server
    logger.info "Re-initializing express server ..."
    server.close() # existing connection will still be processed async
    startExpress() # start server with new config


debugLogConfig = ->
  if config.getConf().logger.level is 'debug'
    logger.debug 'Full config:'
    logger.debug JSON.stringify config.getConf(), null, '  '


if process.env.NODE_ENV isnt 'test'
  logger.info 'Attempting to register mediator with core ...'
  config.getConf().openhim.api.urn = config.getMediatorConf().urn

  mediatorUtils.registerMediator config.getConf().openhim.api, config.getMediatorConf(), (err) ->
    if err
      logger.error err
      process.exit 1

    logger.info 'Mediator has been successfully registered'

    configEmitter = mediatorUtils.activateHeartbeat config.getConf().openhim.api

    configEmitter.on 'config', (newConfig) ->
      logger.info 'Received updated config from core'
      config.updateConf newConfig
      debugLogConfig()
      restartExpress()

    configEmitter.on 'error', (err) -> logger.error err

    mediatorUtils.fetchConfig config.getConf().openhim.api, (err, newConfig) ->
      return logger.error err if err
      logger.info 'Received initial config from core'
      config.updateConf newConfig
      debugLogConfig()
      startExpress()


exports.app = app
