const express = require('express');
const redis = require('redis');

const testing = false;

console.log('VPs server starting ... ');

console.log('config load ... ');

let configPath;

// var privateKey;
// var certificate;
let disabled = new Set();

if (testing) {
  configPath = './kube/test_config.json';
  // privateKey = fs.readFileSync('./kube/secrets/certificates/vps.key.pem');//, 'utf8'
  // certificate = fs.readFileSync('./kube/secrets/certificates/vps.cert.cer');
  // config.SITENAME = 'localhost'
} else {
  configPath = '/etc/vps/config.json';
  // privateKey = fs.readFileSync('/etc/https-certs/key.pem');//, 'utf8'
  // certificate = fs.readFileSync('/etc/https-certs/cert.pem');
}

const config = require(configPath);
console.log(config);

const rclient = redis.createClient(config.PORT, config.HOST);

// const credentials = { key: privateKey, cert: certificate };

const app = express();

function backup() {
  console.log('Starting hourly backup...');
  rclient.lastsave((_err, reply) => {
    if (new Date() < (reply + 3600000)) {
      console.log('last backup at less then one hour. Skipping.');
    } else {
      rclient.bgsave((_ierr, reply) => {
        console.log(reply);
      });
    }
  });
}

app.delete('/grid/', async (_req, res) => {
  console.log('deleting all of the grid info ');

  rclient.del(await rclient.smembers('sites'), (_err, reply) => {
    console.log('sites removed:', reply);
  });

  rclient.del('sites');
  rclient.del('grid_cores');

  console.log('resetting grid description version ...');
  rclient.set('grid_description_version', '0');

  res.status(200).send('OK');
});

app.delete('/all_data', async (_req, res) => {
  console.log('deleting all of the database.');
  await rclient.flushdb((_err, reply) => {
    console.log('reply:', reply);
    res.status(200).send(reply);
  });
});

app.put('/grid/:cores', async (req, res) => {
  const { cores } = req.params;
  console.log('setting all of the grid: ', cores, 'cores');

  rclient.set('grid_cores', cores, (_err, reply) => {
    console.log(reply);
  });

  console.log('updating grid description version ...');
  rclient.incr('grid_description_version');

  res.status(200).send('OK');
});

app.put('/site/:cloud/:sitename/:cores', async (req, res) => {
  const { cloud } = req.params;
  const site = req.params.sitename;
  const { cores } = req.params;

  console.log('adding a site', site, 'to', cloud, 'cloud with', cores, 'cores');

  rclient.sadd('sites', `${cloud}:${site}`, (_err, reply) => {
    console.log(reply);
  });

  rclient.set(`${cloud}:${site}`, cores, (_err, reply) => {
    console.log(reply);
  });

  console.log('updating grid description version ...');
  rclient.incr('grid_description_version');

  res.status(200).send('OK');
});

app.put('/site/disable/:sitename', async (req, res) => {
  const site = req.params.sitename;
  console.log('disabling site', site);

  disabled.add(site);

  rclient.sadd('disabled_sites', site, (_err, reply) => {
    console.log(`disabled ${reply} site.`);
  });

  res.status(200).send('OK');
});

app.put('/site/enable/:sitename', async (req, res) => {
  const site = req.params.sitename;
  console.log('enabling site', site);

  disabled.delete(site);

  rclient.srem('disabled_sites', site, (_err, reply) => {
    console.log(`removed ${reply} site from disabled sites.`);
  });

  res.status(200).send('OK');
});

app.get('/grid/', async (_req, res) => {
  console.log('returning all grid info');

  rclient.smembers('sites', (err, sites) => {
    if (err) {
      console.log('err. sites', err);
      res.status(500).send('could not find sites list.');
    }

    console.log('sites:', sites);

    rclient.mget(sites, (_err, site_cores) => {
      const cores = {};
      for (i in sites) {
        console.log(sites[i], site_cores[i]);
        [cloud, site_name] = sites[i].split(':');
        if (!(cloud in cores)) {
          cores[cloud] = [];
        }
        cores[cloud].push([site_name, Number(site_cores[i])]);
      }

      res.status(200).send(cores);
    });
  });
});

app.get('/site/:cloud/:sitename', async (req, res) => {
  const site = `${req.params.cloud}:${req.params.sitename}`;

  console.log('looking up site:', site);

  rclient.exists(site, (_err, reply) => {
    if (reply === 0) {
      console.log('not found');
      res.status(400).send('not found.');
    } else {
      rclient.get(site, (_ierr, ireply) => {
        console.log('found: ', ireply);
        res.status(200).send(`found: ${ireply}`);
      });
    }
  });
});

// the main function !
app.get('/ds/:sites/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  // console.log('ds to vp:', ds);

  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) {
      // console.log('not found');
      rclient.blpop('unas', 1000, (_err, reply) => {
        if (!reply) {
          res.status(400).send('Timeout');
          return;
        }
        let sites = reply[1].split(',')
        if (req.params.sites > 0) {
          sites = sites.filter(site => !disabled.has(site));
          sites = sites.slice(0, req.params.sites);
        }
        rclient.rpush(ds, sites);
        res.status(200).send(sites);
      });
    } else {
      rclient.lrange(ds, 0, -1, (err, reply) => {
        // console.log("found", reply);
        res.status(200).send(reply);
      });
    }
  });
});

app.get('/ds/reassign/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  // console.log('reassigning ds:', ds);

  rclient.blpop('unas', 1000, (_err, reply) => {
    if (!reply) {
      res.status(400).send('Timeout');
      return;
    }
    const sites = reply[1].split(',');
    rclient.del(ds);
    rclient.rpush(ds, sites);
    res.status(200).send(sites);
  });
});


app.get('/test', async (_req, res) => {
  console.log('TEST starting...');

  rclient.set('ds', 'TEST_OK', (_err, reply) => {
    console.log(reply);
  });

  rclient.get('ds', (_err, reply) => {
    console.log(reply);
    res.send(reply);
  });
});

app.get('/healthz', (_request, response) => {
  console.log('health call');
  try {
    response.status(200).send('OK');
  } catch (err) {
    console.log('something wrong', err);
  }
});

app.get('/', (req, res) => res.send('Hello from the Virtual Placement Service.'));

app.use((err, req, res, next) => {
  console.error('Error in error handler: ', err.message);
  res.status(err.status).send(err.message);
});


app.listen(80, () => console.log('Listening on port 80!'));

// var httpsServer = https.createServer(credentials, app).listen(443);

// // redirects if someone comes on http.
// http.createServer(
//     //     function (req, res) {
//     //     res.writeHead(302, { 'Location': 'https://' + config.SITENAME });
//     //     res.end();
//     // }
// ).listen(80);


async function main() {
  try {
    await rclient.on('connect', () => {
      console.log('connected');
    });

    await rclient.setnx('grid_description_version', '0');

    await rclient.smembers('disabled_sites', (_err, reply) => {
      console.log('Disabled sites:', reply);
      disabled = new Set(reply);
    });
    setInterval(backup, 3600000);
    // setInterval(backup, 86400000);
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
