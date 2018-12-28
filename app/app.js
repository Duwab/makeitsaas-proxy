require('dotenv').config();

const YAML = require('yamljs');
const fs = require('fs');
var http = require('http'),
    httpProxy = require('http-proxy');

var proxy = httpProxy.createProxyServer({});
var MAIN_CONFIG = {};

var server = http.createServer(function(req, res) {
  let hostConfig = getHostConfig(req.headers.host);

  if(!hostConfig) {
    return sendDefaultResponse(res);
  }

  let matchingService = hostConfig.services.filter(service => {
    let rule = new RegExp(`^${service.path}`);
    return rule.test(req.url);
  })[0];

  if(!matchingService) {
    return sendDefaultResponse(res);
  }

  console.log('matching service :', `<${hostConfig.envCode}>${matchingService.path}`);
  req.url = req.url.slice(matchingService.path.length);
  proxy.web(req, res, { target: `http://${matchingService.host}:${matchingService.port}` });
});

setInterval(watchConfig, 2000);

console.log(`listening on port ${process.env.SERVER_PORT}`);
server.listen(process.env.SERVER_PORT);

initConfig();

function sendDefaultResponse(res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Proxy operational');
  res.end();
}

function initConfig() {
  fs.readdir(`./config/routes`, function(err, items) {
    if(err) {
      console.log('error initConfig', err);
    } else {
      items.map(item => reloadEnvironement(item.replace('.yml', '')));
    }
  });
}

function watchConfig() {
  fs.readdir(`./config/reload`, function(err, items) {
    if(err) {
      console.log('error watchConfig', err);
    } else {
      items.map(item => reloadEnvironement(item));
    }
  });
}

function reloadEnvironement(envCode) {
  let envConfig = YAML.load(`./config/routes/${envCode}.yml`);
  envConfig.envCode = envCode;
  if(isValidConfig(envConfig)) {
    MAIN_CONFIG[envCode] = envConfig;
    console.log(envCode, envConfig);
  } else {
    console.log('invalid config for', envCode, envConfig);
  }
  fs.unlink(`./config/reload/${envCode}`, () => {});
}

function getHostConfig(host) {
  for(let envCode in MAIN_CONFIG) {
    let envConfig = MAIN_CONFIG[envCode];
    try {
      if(!isValidConfig(envConfig)) {
        return;
      }
      if(envConfig.hosts.indexOf(host) !== -1) {
        return envConfig;
      }
    } catch(e) {
      return console.log('invalid config for', envCode, envConfig);
    }
  }
}

function isValidConfig(envConfig) {
  return envConfig.hosts && envConfig.hosts && envConfig.services && envConfig.services.length;
}
