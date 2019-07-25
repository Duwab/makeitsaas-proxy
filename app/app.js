require('dotenv').config();

const YAML = require('yamljs');
const fs = require('fs');
var http = require('http'),
    httpProxy = require('http-proxy');

var proxy = httpProxy.createProxyServer({});
var ENVS_CONFIG = {};
var VHOSTS_CONFIG = {};
let standByCodes = {};

var server = http.createServer(function(req, res) {
  let hostConfig = getVHostConfig(req.headers.host);

  if(!hostConfig) {
    return sendDefaultResponse(res);
  }

  if(standByCodes[hostConfig.envCode]) {
    return sendTemporaryUnavailableResponse(res);
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
  let s = matchingService.secure ? 's':'';
  let target = `http${s}://${matchingService.host}:${matchingService.port}${matchingService.outputBasePath || ''}`;
  // if type web then index on 404 (si pas d'extension)
  if(matchingService.behavior === 'web') {
    req.url = formatWebServerUrl(req.url);
  }
  console.log(target);
  console.log(req.url);
  proxy.web(req, res, {
    target,
    changeOrigin: s === 's'
  });
});

proxy.on('error', function (err, req, res) {
  res.writeHead(500, {
    'Content-Type': 'text/plain',
    'Proxy-Status': 'Running'
  });

  res.end('Service unavailable');
});


setInterval(watchStandby, 500);
setInterval(watchConfig, 2000);

console.log(`listening on port ${process.env.SERVER_PORT}`);
server.listen(process.env.SERVER_PORT);

initConfig();

function sendDefaultResponse(res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Proxy operational');
  res.end();
}

function sendTemporaryUnavailableResponse(res) {
  res.writeHead(503, { 'Content-Type': 'text/plain' });
  res.write('Pending operations');
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
      items.map(item => item !== '.gitkeep' && reloadEnvironement(item));
    }
  });
}

function watchStandby() {
  fs.readdir(`./config/standby`, function(err, items) {
    let newStandBys = {};
    if(err) {
      console.log('error watchConfig', err);
    } else {
      items.map(envCode => {
        if(envCode !== '.gitkeep') {
          newStandBys[envCode] = true;
        }
      });
      standByCodes = newStandBys;
    }
  });
}

function reloadEnvironement(envCode) {
  let envConfig = YAML.load(`./config/routes/${envCode}.yml`);
  envConfig.envCode = envCode;
  if(isValidConfig(envConfig)) {
    ENVS_CONFIG[envCode] = envConfig;
    console.log(envCode, envConfig);
  } else {
    console.log('invalid config for', envCode, envConfig);
  }
  fs.unlink(`./config/reload/${envCode}`, () => {});
}

function getVHostConfig(domain) {
  for(let envCode in ENVS_CONFIG) {
    let envConfig = ENVS_CONFIG[envCode];
    try {
      if(!isValidConfig(envConfig)) {
        return;
      }
      for(let i = 0; i < envConfig.vhosts.length; i++) {
        let vhostConfig = envConfig.vhosts[i];
        if(vhostConfig.domains.indexOf(domain) !== -1) {
          vhostConfig.envCode = envCode;
          return vhostConfig;
        }
      }

    } catch(e) {
      return console.log('invalid config for', envCode, envConfig);
    }
  }
}

function isValidConfig(envConfig) {
  try {
    if(!envConfig.vhosts.length) {
      return false;
    }

    for(let i = 0; i < envConfig.vhosts.length; i++) {
      let vhost = envConfig.vhosts[i];
      if(!vhost.domains.length || !vhost.services.length) {
        return false;
      }
    }
  } catch(e) {
    return false;
  }

  return true;
}


function formatWebServerUrl(url) {
  // web server : if url is not a file, change to index.html
  let rest = url.split(/(\?|#)/);
  let base = rest.shift();
  let isFilePattern = /\.[a-zA-Z0-9]{1,10}$/.test(base);
  if(!isFilePattern) {
    return '/index.html' + rest.join('');
  } else {
    return url;
  }
}
