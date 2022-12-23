const elasticsearch = require('@elastic/elasticsearch');
const fs = require('fs');
// const https = require('https');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const redis = require('redis');
const config = require('/etc/vps/config.json');
const espath = require('/etc/vps/es-conn.json');
const tokens = require('/etc/vps/tokens.json');
const bodyParser = require('body-parser');
const passport = require('passport');
const { Strategy } = require('passport-http-bearer');

const Keys = require('./keys');
const Cluster = require('./cluster');

const app = express();
app.use(helmet());

const jsonParser = bodyParser.json();

console.log('VPs server starting ... ');
console.log('config: ', config);

// const rclient = redis.createClient(config.PORT, config.HOST);

const rclient = redis.createClient({
  socket: {
    host: config.HOST,
    port: config.PORT,
  },
});

const subscriber = rclient.duplicate();

const es = new elasticsearch.Client({ node: espath.ES_HOST, log: 'error' });

passport.use(new Strategy(
  (token, done) => {
    if (token in tokens) {
      return done(null, tokens[token], { scope: 'all' });
    }
    return done(null, false);
  },
));

const disabled = new Set();
let paused = false;

// ES reporting things
let esData = []; // buffer to hold a batch of ES reporting data.
let inProgress = false;
const batchSize = 100;
let esIndexRequests = 'virtual_placement';
let esIndexLiveness = 'vp_liveness';
let esIndexLookups = 'vp_lookups';
if (config.TESTING) {
  esIndexRequests = 'test_virtual_placement';
  esIndexLiveness = 'test_vp_liveness';
  esIndexLookups = 'test_vp_lookups';
}

// contains info on currently active servers.
// populated through pubsub.
// structure: {'cacheSite':{'cacheServer':{'timestamp':234,'address':'root://'}}}
const cacheSites = {};

// contains info on which client is served by which cache site
// structure: {'client':'cacheSite'}
let servingTopology = {};

// each objects of class Cluster. Serves to calculate prefixes.
// filled on each change to a cluster.
const clusters = {};

// const pause = (duration) => new Promise(res => setTimeout(res, duration));

function esAddRequest(index, doc) {
  esData.push({ index: { _index: index } }, doc);
  // for each doc added arrays grows by 2
  if (esData.length > batchSize * 2 && inProgress === false) {
    inProgress = true;

    es.bulk(
      { body: esData.slice(0, batchSize * 2) },
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

// this function is called on any change in serving map
// it is triggered through pubsub message.
function reloadServingTopology() {
  rclient.hGetAll(Keys.ServingTopology, (error, reply) => {
    if (error) {
      console.error('Problem loading serving topology', error);
    }
    servingTopology = reply;
    console.log('Serving Topology:', servingTopology);
  });
}

// reloads disabled sites
function reloadSiteStates() {
  rclient.sMembers(Keys.DisabledSites, (err, reply) => {
    if (!err) {
      console.log('Disabled sites:', reply);
      disabled.clear();
      reply.forEach((s) => disabled.add(s.split(':')[1]));
    }
  });
}

// called on each change in number of servers in a cache site
// recalculates server ranges.
function recalculateCluster(clusterName) {
  console.log(`recalculating cluster ${clusterName}`);
  const serverSizes = [];
  Object.keys(cacheSites[clusterName]).forEach((cacheServer) => {
    serverSizes.push([
      cacheSites[clusterName][cacheServer].address,
      cacheSites[clusterName][cacheServer].size,
    ]);
  });
  clusters[clusterName] = new Cluster.Cluster(serverSizes);
}

// this subscription listens on heartbeat messages
// it parses them and updates cache topology information
// for the server. It sends server info to Elasticsearch.
subscriber.on('message', (channel, message) => {
  console.log(`Received message: ${message}, on channel: ${channel}`);
  if (channel === 'heartbeats') {
    const HB = JSON.parse(message);
    if (!(HB.site in cacheSites)) {
      cacheSites[HB.site] = {};
    }
    if (HB.id in cacheSites[HB.site]) {
      cacheSites[HB.site][HB.id] = HB; // this can't be combined.
    } else {
      cacheSites[HB.site][HB.id] = HB;
      recalculateCluster(HB.site);
    }
  } else if (channel === 'topology') {
    reloadServingTopology();
  } else if (channel === 'siteStatus') {
    reloadSiteStates();
  }
});

// this function is called periodically and removes from cache topology
// all servers that did not send a heartbeat in last LIFETIME_INTERVAL
// it sends data on removed cache server to Elasticsearch.
function cleanDeadServers() {
  const cutoffTime = Date.now() - config.LIFETIME_INTERVAL * 1000;
  console.log('cleaning dead servers', cutoffTime);
  Object.keys(cacheSites).forEach((cacheSite) => {
    Object.keys(cacheSites[cacheSite]).forEach((cacheServer) => {
      if (cacheSites[cacheSite][cacheServer].timestamp < cutoffTime) {
        console.log(`removing  site: ${cacheSite} server:${cacheServer}`);
        const doc = cacheSites[cacheSite][cacheServer];
        doc.live = false;
        doc.timestamp = Date.now();
        esAddRequest(esIndexLiveness, doc);
        delete cacheSites[cacheSite][cacheServer];
        if (Object.keys(cacheSites[cacheSite]).length === 0) {
          delete cacheSites[cacheSite];
          delete clusters[cacheSite];
        } else {
          recalculateCluster(cacheSite);
        }
      }
    });
  });
}

function updateGridVersion() {
  console.log('updating grid description version ...');
  rclient.incr(Keys.GDV, (err, version) => {
    if (err) {
      console.error('Could not increment grid description version.');
    }
    console.log('current grid version:', version);
  });
}

function backup() {
  console.log('Starting hourly backup...');
  rclient.lastSave((_err, reply) => {
    if (new Date() < (reply + 3600000)) {
      console.log('last backup at less then one hour. Skipping.');
    } else {
      rclient.bgSave((_ierr, reply1) => {
        console.log(reply1);
      });
    }
  });
}

app.delete('/grid/', passport.authenticate('bearer', { session: false }), (_req, res) => {
  console.log('deleting all of the grid info.... VERIFIED');

  rclient.sMembers(Keys.Sites, (err1, result1) => {
    if (!err1) {
      console.log('deleting sites', result1);
      rclient.del(result1, (err2, result2) => {
        if (!err2) {
          console.log('sites deleted:', result2);
          rclient.del(Keys.Sites);
        } else {
          console.error('could not delete sites');
        }
      });
    } else {
      console.error('could not get sites to delete');
    }
  });

  console.log('resetting grid description version ...');
  rclient.set(Keys.GDV, '0');

  res.status(200).send('OK');
});

app.delete('/all_data', passport.authenticate('bearer', { session: false }), (_req, res) => {
  console.log('deleting all of the database. VERIFIED');
  rclient.flushDb((_err, reply) => {
    console.log('reply:', reply);
    console.log('resetting grid description version ...');
    rclient.set(Keys.GDV, '0');
    res.status(200).send(reply);
  });
});

app.delete('/ds/:dataset', (req, res) => {
  const ds = req.params.dataset;
  console.log('deleting dataset placement.');
  rclient.del(ds, (err, reply) => {
    if (err) {
      console.log('error deleting dataset placement ', err);
      res.status(500).send('error deleting dataset placement', err);
    }
    const rep = `datasets deleted: ${reply}`;
    res.status(200).send(rep);
  });
});

app.get('/site/disabled', async (_req, res) => {
  console.log('returning disabled sites');

  rclient.sMembers(Keys.DisabledSites, (err, replyDisabled) => {
    if (err) {
      console.log('err. sites', err);
      res.status(500).send('could not find disabled sites list.');
    }
    res.status(200).send(replyDisabled);
  });
});

app.put('/site/disable/:cloud/:site', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { cloud } = req.params;
  const { site } = req.params;
  console.log(`disabling site ${site} in cloud ${cloud}`);

  rclient.sMembers(Keys.Sites, (err1, result1) => {
    if (!err1) {
      console.log('found sites:', result1);
      if (result1.includes(`${cloud}:${site}`)) {
        rclient.sAdd(Keys.DisabledSites, `${cloud}:${site}`, (err, reply) => {
          if (err) {
            console.error('could not add site to disabled sites', err);
            res.status(500).send('could not add site to disabled sites', err);
          }
          rclient.publish('siteStatus', 'change');
          console.log(`disabled site: ${reply}.`);
          res.status(200).send(`disabled site: ${reply}.`);
        });
      } else {
        console.error('that site does not exist!');
        res.status(400).send('Site does not exist. Could not add site to disabled sites.');
      }
    } else {
      console.error('could not get Keys.Sites!');
      res.status(500).send('Internal issue');
    }
  });
});

app.put('/site/enable/:cloud/:site', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { cloud } = req.params;
  const { site } = req.params;
  console.log(`enabling site ${site} in cloud ${cloud}`);
  if (disabled.has(site)) {
    rclient.sRem(Keys.DisabledSites, `${cloud}:${site}`, (err, reply) => {
      if (!err) {
        console.log(`removed ${reply} site from disabled sites.`);
        rclient.publish('siteStatus', 'change');
        res.status(200).send('OK');
      } else {
        console.error('could not remove from DisabledSites', err);
        res.status(500).send('Internal Issue');
      }
    });
  } else {
    res.status(400).send('Site was not disabled!');
  }
});

app.put('/site/:cloud/:sitename/:cores', passport.authenticate('bearer', { session: false }), async (req, res, next) => {
  // console.log('adding a site.... NOT VERIFIED');
  const { cloud } = req.params;
  const site = req.params.sitename;
  const { cores } = req.params;

  console.log(`adding a site ${site} to ${cloud} cloud with ${cores} cores`);

  rclient.sAdd(Keys.Sites, `${cloud}:${site}`, (err, numb) => {
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

  updateGridVersion();

  res.status(200).send('OK');
});

app.put('/rebalance', async (req, res) => {
  console.log('Doing full rebalance!');
  // TODO - this was not started.

  // const counter = {};
  // get all the keys that represent datasets
  // no 'sites', individual sites names, disabled_sites, unas, gridDescriptionVersion

  // calculate what are current shares and check which ones need updates.

  // do the updates.

  res.status(200).send('OK');
});

app.put('/pause', passport.authenticate('bearer', { session: false }), async (req, res) => {
  paused = true;
  console.log('PAUSED!');
  res.status(200).send('OK');
});

app.put('/unpause', passport.authenticate('bearer', { session: false }), async (req, res) => {
  paused = false;
  console.log('UNPAUSED!');
  res.status(200).send('OK');
});

app.get('/pause', async (req, res) => {
  console.log('returning pause state:', paused);
  res.status(200).send(paused);
});

app.get('/grid/', async (_req, res) => {
  console.log('returning all grid info');

  rclient.sMembers(Keys.Sites, (err, sites) => {
    if (err) {
      console.log('err. sites', err);
      res.status(500).send('could not find sites list.');
    }

    console.log('sites:', sites);

    rclient.mGet(sites, (_err, siteCores) => {
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

// completely deletes site
app.delete('/site/:cloud/:sitename', async (req, res) => {
  const site = `${req.params.cloud}:${req.params.sitename}`;
  console.log('deleting site:', site);
  rclient.del(site, (err, result) => {
    if (!err) {
      console.log('sites deleted:', result);
      rclient.sRem(Keys.Sites, site);
      updateGridVersion();
      res.status(200).send('OK');
    } else {
      console.error('could not delete sites');
      res.status(500).send('not found.');
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

  if (ds.startsWith('panda:panda.um.')) {
    // these are pmerge input datasets and are not cachable.
    res.status(200).send(['other']);
    return;
  }

  // console.log('ds to vp:', ds);
  const doc = {
    timestamp: Date.now(),
    ds,
  };

  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) { // console.log('not found');
      rclient.rPopLPush('unas', ds, (errPLP, replyMove) => {
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
        esAddRequest(esIndexRequests, doc);
        res.status(200).send(sites);
      });
    } else {
      rclient.lRange(ds, 0, -1, async (err, replyFound) => {
        const sites = replyFound[0].split(',');
        // console.log('found', sites);
        doc.sites = sites;
        doc.initial = false;
        esAddRequest(esIndexRequests, doc);
        res.status(200).send(sites);
      });
    }
  });
});

app.get('/ds/reassign/:dataset', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const ds = req.params.dataset;
  console.log('reassigning ds:', ds, 'in random way');

  rclient.blPop('unas', 1000, (_err, reply) => {
    if (!reply) {
      res.status(400).send('Timeout');
      return;
    }
    const sites = reply[1].split(',');
    rclient.del(ds);
    rclient.rPush(ds, sites);
    res.status(200).send(sites);
  });
});

// sites is given like AGLT2_VP_DISK,MWT2_VP_DISK,BNL_VP_DISK
app.put('/ds/reassign/:dataset/:sites', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { dataset } = req.params;
  const { sites } = req.params;
  console.log('reassigning ds:', dataset, 'to:', sites);
  // sites = sites.split(',');
  rclient.del(dataset, (_err1, reply1) => {
    if (!reply1) {
      console.log('that DS was not assigned before');
    }
    rclient.rPush(dataset, sites, (_err2, reply2) => {
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

// returns all of serving topology as JSON
app.get('/serve', async (req, res) => {
  console.info('returning serving topology');
  res.status(200).json(servingTopology);
});

// allows given xcache to serve a given client
app.put('/serve', jsonParser, passport.authenticate('bearer', { session: false }), async (req, res) => {
  // both parameters are mandatory
  const b = req.body;
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  const cacheSite = req.body.cache_site;
  const { client } = req.body;
  if (cacheSite === undefined || cacheSite === null) {
    res.status(400).send('need cache_site parameter.\n');
    return;
  }
  if (client === undefined || client === null) {
    res.status(400).send('need client parameter.\n');
    return;
  }

  rclient.hSet(Keys.ServingTopology, client, cacheSite, (err, reply) => {
    if (!err) {
      console.log(reply);
      rclient.publish('topology', 'added');
    } else {
      console.error('Problem adding to serving topology', err);
      res.status(500).send(err);
    }
  });
  res.status(200).send('OK');
});

// disallow serving given client
app.delete('/serve/:client', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { client } = req.params;
  console.info(`disallowing serving client: ${client}`);

  rclient.hDel(Keys.ServingTopology, client, (err, reply) => {
    if (!err) {
      console.log(reply);
      rclient.publish('topology', 'removed');
    } else {
      console.error('Problem when dissalowing serving.', err);
      res.status(500).send(err);
    }
  });

  res.status(200).send('OK');
});

// for a given client and filename looks up what cache is serving it
// calculates a server to use and returns its address.
app.post('/prefix', jsonParser, async (req, res) => {
  const b = req.body;
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  if (b.client === undefined || b.client === null) {
    res.status(400).send('Client is required.\n');
    return;
  }
  if (b.filename === undefined || b.filename === null) {
    res.status(400).send('Filename is required.\n');
    return;
  }
  console.log(`request for prefix client: ${b.client} filename:${b.filename}`);

  b.prefix = '';

  if (!(b.client in servingTopology)) {
    console.log(`client ${b.client} is not served by any cache`);
  } else {
    const servingSite = servingTopology[b.client];
    console.log('servingSite:', servingSite);
    b.prefix = clusters[servingSite].getServer(b.filename);
  }

  b.timestamp = Date.now();
  esAddRequest(esIndexLookups, b);
  res.status(200).send(b.prefix);
});

app.get('/serverRanges', (req, res) => {
  const ranges = {};
  Object.keys(clusters).forEach((cluster) => {
    ranges[cluster] = { servers: clusters[cluster].servers, ranges: clusters[cluster].Ranges };
  });
  console.debug('returned ranges');
  res.status(200).json(ranges);
});

//
//              LIVENESS
//

// returns a list of active xcache servers
app.get('/liveness', (req, res) => {
  console.debug('returning cacheSites');
  res.status(200).json(cacheSites);
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
  b.timestamp = Date.now();
  b.live = true;
  esAddRequest(esIndexLiveness, b);
  rclient.publish('heartbeats', JSON.stringify(b));
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

const opt = {
  key: fs.readFileSync('/etc/vps/tls.key'),
  cert: fs.readFileSync('/etc/vps/tls.crt'),
};

// https.createServer(opt, app).listen(443, () => {
//   console.log('Listening on port 443!');
// });

http.createServer(opt, app).listen(80, () => {
  console.log('Listening on port 80!');
});

async function main() {
  console.log('Keys:', Keys);
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
    rclient.setNX(Keys.GDV, '0');

    reloadSiteStates();
    reloadServingTopology();

    setInterval(backup, config.BACKUP_INTERVAL * 3600000);
    setInterval(cleanDeadServers, config.LIFETIME_INTERVAL * 1000);

    subscriber.subscribe('heartbeats', 'topology');
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
