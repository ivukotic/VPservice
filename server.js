const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const redis = require('redis');
const config = require('/etc/vps/config.json');
const espath = require('/etc/vps/es-conn.json');
const bodyParser = require('body-parser');

const app = express();
const jsonParser = bodyParser.json();

console.log('VPs server starting ... ');
console.log('config: ', config);

const rclient = redis.createClient(config.PORT, config.HOST);

const es = new elasticsearch.Client({ node: espath.ES_HOST, log: 'error' });

let disabled = new Set();
let paused = false;

// ES reporting things
let esData = []; // buffer to hold a batch of ES reporting data.
let inProgress = false;
const batchSize = 100;
let esIndex = 'virtual_placement';
if (config.TESTING) {
  esIndex = 'test_virtual_placement';
}

function esAddRequest(doc) {
  esData.push({ index: {} }, doc);
  // for each doc added arrays grows by 2
  if (esData.length > batchSize * 2 && inProgress === false) {
    inProgress = true;

    es.bulk(
      { index: esIndex, body: esData.slice(0, batchSize * 2) },
      (err, result) => {
        if (err) {
          console.error('ES indexing failed\n', err);
          console.log('dropping data.');
          esData = [];
        } else {
          console.log('ES indexing done in', result.body.took, 'ms');
          esData = esData.slice(batchSize * 2);
        }
        inProgress = false;
      },
    );
  }
}

function backup() {
  console.log('Starting hourly backup...');
  rclient.lastsave((_err, reply) => {
    if (new Date() < (reply + 3600000)) {
      console.log('last backup at less then one hour. Skipping.');
    } else {
      rclient.bgsave((_ierr, reply1) => {
        console.log(reply1);
      });
    }
  });
}

app.delete('/grid/', (_req, res) => {
  console.log('deleting all of the grid info.... VERIFIED');

  rclient.smembers('sites', (err1, result1) => {
    if (!err1) {
      console.log('deleting sites', result1);
      rclient.del(result1, (err2, result2) => {
        if (!err2) {
          console.log('sites deleted:', result2);
          rclient.del('sites');
        } else {
          console.error('could not delete sites');
        }
      });
    } else {
      console.error('could not get sites to delete');
    }
  });

  console.log('resetting grid description version ...');
  rclient.set('grid_description_version', '0');

  res.status(200).send('OK');
});

app.delete('/all_data', (_req, res) => {
  console.log('deleting all of the database. VERIFIED');
  rclient.flushdb((_err, reply) => {
    console.log('reply:', reply);
    console.log('resetting grid description version ...');
    rclient.set('grid_description_version', '0');
    res.status(200).send(reply);
  });
});

app.delete('/ds/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  console.log('deleting dataset placement.');
  await rclient.del(ds, (err, reply) => {
    if (err) {
      console.log('error deleting dataset placement ', err);
      res.status(500).send('error deleting dataset placement', err);
    }
    const rep = `datasets deleted: ${reply}`;
    res.status(200).send(rep);
  });
});

app.put('/site/:cloud/:sitename/:cores', async (req, res, next) => {
  // console.log('adding a site.... NOT VERIFIED');
  const { cloud } = req.params;
  const site = req.params.sitename;
  const { cores } = req.params;

  console.log('adding a site', site, 'to', cloud, 'cloud with', cores, 'cores');

  rclient.sadd('sites', `${cloud}:${site}`, (err, numb) => {
    if (err) {
      next(new Error('Could not add site', err));
    }
    console.log('sites added:', numb);
  });

  rclient.set(`${cloud}:${site}`, cores, (err, reply) => {
    if (err) {
      next(new Error('Could not add site to the cloud', err));
    }
    console.log('site added to cloud or updated: ', reply);
  });

  console.log('updating grid description version ...');
  rclient.incr('grid_description_version', (err, version) => {
    if (err) {
      next(new Error('Could not increment grid description version.'));
    }
    console.log('current grid version:', version);
  });

  res.status(200).send('OK');
});

app.put('/site/disable/:sitename', async (req, res) => {
  // TODO - check that site is there - it is in the list of "sites"
  const site = req.params.sitename;
  console.log('disabling site', site);

  disabled.add(site);

  rclient.sadd('disabled_sites', site, (err, reply) => {
    if (err) {
      console.log('could not add site to disabled sites', err);
      res.status(500).send('could not add site to disabled sites', err);
    }
    console.log(`disabled site: ${reply}.`);
    res.status(200).send(`disabled site: ${reply}.`);
  });
});

app.put('/site/enable/:sitename', async (req, res) => {
  // TODO check that site is in the list of sites.
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
  // TODO - this was not started.

  // const counter = {};
  // get all the keys that represent datasets
  // no 'sites', individual sites names, disabled_sites, unas, grid_description_version

  // calculate what are current shares and check which ones need updates.

  // do the updates.

  res.status(200).send('OK');
});

app.put('/flip_pause', async (req, res) => {
  // TODO - split to pause and unpause
  paused = !(paused);
  console.log('FLIPPED PAUSE', paused);
  res.status(200).send('OK');
});

app.get('/pause', async (req, res) => {
  console.log('returning pause state.');
  res.status(200).send(paused);
});

app.get('/site/disabled', async (_req, res) => {
  console.log('returning disabled sites');

  rclient.smembers('disabled_sites', (err, replyDisabled) => {
    if (err) {
      console.log('err. sites', err);
      res.status(500).send('could not find disabled sites list.');
    }
    res.status(200).send(replyDisabled);
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

    rclient.mget(sites, (_err, siteCores) => {
      const cores = {};
      sites.forEach((site, i) => {
        console.log(site, siteCores[i]);
        const [cloud, siteName] = site.split(':');
        if (!(cloud in cores)) {
          cores[cloud] = [];
        }
        cores[cloud].push([siteName, Number(siteCores[i])]);
      });

      res.status(200).send(cores);
    });
  });
});

app.get('/site/:cloud/:sitename', async (req, res) => {
  console.log('If there is such a site in such a cloud returns number of cores. VERIFIED');
  const site = `${req.params.cloud}:${req.params.sitename}`;

  console.log('looking up site:', site);

  rclient.exists(site, (_err, reply) => {
    if (reply === 0) {
      console.log('not found');
      res.status(500).send('not found.');
    } else {
      rclient.get(site, (_ierr, ireply) => {
        console.log('found: ', ireply);
        res.status(200).send(`Site found. Cores: ${ireply}`);
      });
    }
  });
});

// the main function !
app.get('/ds/:nsites/:dataset', async (req, res) => {
  if (paused) {
    res.status(200).send(['other']);
    return;
  }
  const nsites = parseInt(req.params.nsites, 10);
  const ds = req.params.dataset;
  // console.log('ds to vp:', ds);
  const doc = {
    timestamp: Date.now(),
    ds,
  };

  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) { // console.log('not found');
      rclient.rpoplpush('unas', ds, (errPLP, replyMove) => {
        if (!replyMove) {
          res.status(400).send(['other']);
          return;
        }
        let sites = replyMove.split(',');
        if (nsites > 0) {
          sites = sites.filter((site) => !disabled.has(site));
          sites = sites.slice(0, nsites);
        }
        doc.sites = sites;
        doc.initial = true;
        esAddRequest(doc);
        res.status(200).send(sites);
      });
    } else {
      rclient.lrange(ds, 0, -1, async (err, replyFound) => {
        const sites = replyFound[0].split(',');
        // console.log('found', sites);
        doc.sites = sites;
        doc.initial = false;
        esAddRequest(doc);
        res.status(200).send(sites);
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

// sites is given like AGLT2_VP_DISK,MWT2_VP_DISK,BNL_VP_DISK
app.put('/ds/reassign/:dataset/:sites', async (req, res) => {
  const { dataset } = req.params;
  let { sites } = req.params;
  console.log('reassigning ds:', dataset, 'to:', sites);
  sites = sites.split(',');
  rclient.del(dataset, (_err1, reply1) => {
    if (!reply1) {
      console.log('that DS was not assigned before');
    }
    rclient.rpush(dataset, sites, (_err2, reply2) => {
      if (!reply2) {
        res.status(400).send('Timeout');
      }
      res.status(200).send('Done.');
    });
  });
});

//
//             TOPOLOGY
//

app.get('/prefix/:client/:filename', async (req, res) => {
  const { client } = req.params;
  const { filename } = req.params;
  console.log(`request for prefix client: ${client} filename:${filename}`);

//   rclient.blpop('unas', 1000, (_err, reply) => {
//     if (!reply) {
//       res.status(400).send('Timeout');
//       return;
//     }
//     const sites = reply[1].split(',');
//     rclient.rpush(ds, sites);
//     res.status(200).send(sites);
//   });
});

// XCache endpoints will send heartbeats here
app.post('/liveness', jsonParser, async (req, res) => {
  const b = req.body;
  if (b === undefined || b === null || Object.keys(b).length < 3) {
    res.status(400).send('nothing POSTed or data incomplete.\n');
    return;
  }
  if (b.id === undefined || b.id === null) {
    res.status(400).send('ID is required.\n');
    return;
  }
  if (b.site === undefined || b.site === null) {
    res.status(400).send('site is required.\n');
    return;
  }
  if (b.address === undefined || b.address === null) {
    res.status(400).send('address is required.\n');
    return;
  }
  // size
  res.status(200).send('OK');
});

//
//                TEST, HEALTH, ERRORS and DEFAULTS
//

app.get('/test', async (_req, res, next) => {
  console.log('TEST starting...');

  rclient.set('ds', 'TEST_OK', (err, reply) => {
    if (err) {
      next(new Error('Could not set a key in Redis'));
    } else {
      console.log(reply);
    }
  });

  rclient.get('ds', (_err, reply) => {
    console.log(reply);
    rclient.del('ds');
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

app.get('/', (req, res) => res.send(`Hello from the Virtual Placement Service v${process.env.npm_package_version}`));

// handles all not mentioned routes.
app.all('*', (req, res) => {
  res.status(400).send('Bad REST request.');
});

// handles all kinds of issues.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(80, () => console.log('Listening on port 80!'));

async function main() {
  try {
    rclient.on('connect', () => {
      console.log('redis connected OK.');
    });

    try {
      es.ping((err, resp) => {
        console.log('ES ping:', resp.statusCode);
      });
    } catch (err) {
      console.error('server error: ', err);
    }

    // initializes value if it does not exist
    rclient.setnx('grid_description_version', '0');

    // loads disabled sites
    rclient.smembers('disabled_sites', (_err, reply) => {
      console.log('Disabled sites:', reply);
      disabled = new Set(reply);
    });

    setInterval(backup, config.BACKUP_INTERVAL * 3600000);
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
