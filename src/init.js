require('source-map-support').install()

const path = require('path')
global.appRoot = path.join(path.resolve(__dirname), '..')

// Load configuration
const config = require('./config')
config.load()

const logger = require('winston')
logger.remove(logger.transports.Console)
logger.add(logger.transports.Console, {
  colorize: true,
  timestamp: true,
  level: config.getConf().logger.level
}
)

logger.info(`Initialized configuration from '${config.getConfName()}'`)

if (config.getConf().openhim.api.trustSelfSigned) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
