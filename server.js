const mode = process.env.MODE;

const express = require('express');
const redis = require('redis');
const elasticsearch = require('@elastic/elasticsearch');

const app = express();

console.log('VPs server starting ... ');
console.log('config load ... ');

let configPath;
let esPath;

let disabled = new Set();
let esData = [];

if (mode === 'testing') {
  configPath = './kube/test_config.json';
  esPath = './kube/secrets/es_conn.json';
} else {
  configPath = '/etc/vps/config.json';
  esPath = '/etc/es/es_conn.json';
}

const config = require(configPath);
console.log(config);
const rclient = redis.createClient(config.PORT, config.HOST);


const es_path = require(esPath);
const es = new elasticsearch.Client({ node: es_path.ES_HOST, log: 'error' });

async function es_add_request(doc, last = false) {
  esData.push(doc);
  if (esData.length > 10) {
    es.bulk(
      { index: 'virtual_placement', body: esData },
      (err, reply) => {
        if (err) {
          console.error('ES indexing failed:', err);
          console.log('dropping data.');
          esData = [];
        }
        else {
          console.log('es indexing:', reply);
          esData = [];
        }
      });
  }
}

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

app.delete('/ds/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  console.log('deleting dataset placement.');
  await rclient.del(ds, (_err, reply) => {
    const rep = `datasets deleted: ${reply}`;
    res.status(200).send(rep);
  });
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

app.put('/rebalance', async (req, res) => {
  console.log('Doing full rebalance!');

  const counter = {};
  // get all the keys that represent datasets
  // no 'sites', individual sites names, disabled_sites, unas, grid_description_version

  // calculate what are current shares and check which ones need updates.

  // do the updates.

  res.status(200).send('OK');
});

app.get('/site/disabled', async (_req, res) => {
  console.log('returning disabled sites');

  rclient.smembers('disabled_sites', (err, disabled) => {
    if (err) {
      console.log('err. sites', err);
      res.status(500).send('could not find disabled sites list.');
    }
    res.status(200).send(disabled);
  });

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
app.get('/ds/:nsites/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  // console.log('ds to vp:', ds);
  const doc = {
    timestamp: Date.now(),
    ds,
  };
  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) {
      // console.log('not found');
      rclient.blpop('unas', 1000, (_err, reply) => {
        if (!reply) {
          res.status(400).send('Timeout');
          return;
        }
        let sites = reply[1].split(',');
        if (req.params.sites > 0) {
          sites = sites.filter(site => !disabled.has(site));
          sites = sites.slice(0, req.params.nsites);
        }
        rclient.rpush(ds, sites);
        doc.sites = sites;
        doc.initial = true;
        es_add_request(doc);
        res.status(200).send(sites);
      });
    } else {
      rclient.lrange(ds, 0, -1, (err, reply) => {
        // console.log("found", reply);
        doc.sites = reply;
        doc.initial = false;
        es_add_request(doc);
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
