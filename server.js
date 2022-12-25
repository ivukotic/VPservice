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

async function esAddRequest(index, doc) {
  esData.push({ index: { _index: index } }, doc);
  // for each doc added arrays grows by 2
  if (esData.length > batchSize * 2 && inProgress === false) {
    inProgress = true;

    const operations = esData.slice(0, batchSize * 2);
    const bulkResponse = await es.bulk({ refresh: true, operations });

    if (bulkResponse.errors) {
      console.error('ES indexing failed\n', bulkResponse.items);
      console.log('dropping data.');
      esData = [];
    } else {
      console.log('ES indexing done in', bulkResponse.took, 'ms');
      esData = esData.slice(batchSize * 2);
    }

    inProgress = false;
  }
}

// this function is called on any change in serving map
// it is triggered through pubsub message.
async function reloadServingTopology() {
  try {
    const reply = await rclient.hGetAll(Keys.ServingTopology);
    servingTopology = reply;
    console.log('Serving Topology:', servingTopology);
  } catch (err) {
    console.error('Problem loading serving topology', err);
  }
}

// reloads disabled sites
async function reloadSiteStates() {
  try {
    const reply = await rclient.sMembers(Keys.DisabledSites);
    console.log('Disabled sites:', reply);
    disabled.clear();
    reply.forEach((s) => disabled.add(s.split(':')[1]));
  } catch (err) {
    console.error('Problem loading serving topology', err);
  }
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

async function updateGridVersion() {
  console.log('updating grid description version ...');
  try {
    const version = await rclient.incr(Keys.GDV);
    console.log('current grid version:', version);
  } catch (err) {
    console.error('Could not increment grid description version.');
  }
}

async function backup() {
  console.log('Starting hourly backup...');
  try {
    const reply = await rclient.lastSave();
    if (new Date() < (reply + 3600000)) {
      console.log('last backup at less then one hour. Skipping.');
    } else {
      const reply1 = rclient.bgSave();
      console.log(reply1);
    }
  } catch (err) {
    console.error('issue with creating hourly backup.', err);
  }
}

app.delete('/grid/', passport.authenticate('bearer', { session: false }), async (_req, res) => {
  console.log('deleting all of the grid info....');

  try {
    const result1 = await rclient.sMembers(Keys.Sites);
    console.log('deleting sites', result1);
    const result2 = await rclient.del(result1);
    console.log('sites deleted:', result2);
    await rclient.del(Keys.Sites);

    console.log('resetting grid description version ...');
    await rclient.set(Keys.GDV, '0');

    res.status(200).send('OK');
  } catch (err) {
    console.error('could not get sites to delete', err);
  }
});

app.delete('/all_data', passport.authenticate('bearer', { session: false }), async (_req, res) => {
  console.log('deleting all of the database.');
  const reply = await rclient.flushDb();
  console.log('reply:', reply);
  console.log('resetting grid description version ...');
  rclient.set(Keys.GDV, '0');
  res.status(200).send(reply);
});

app.delete('/ds/:dataset', async (req, res) => {
  const ds = req.params.dataset;
  console.log('deleting dataset placement.');
  try {
    const reply = await rclient.del(ds);
    const rep = `datasets deleted: ${reply}`;
    res.status(200).send(rep);
  } catch (err) {
    console.log('error deleting dataset placement ', err);
    res.status(500).send('error deleting dataset placement', err);
  }
});

app.get('/site/disabled', async (_req, res) => {
  console.log('returning disabled sites');
  try {
    const replyDisabled = await rclient.sMembers(Keys.DisabledSites);
    res.status(200).send(replyDisabled);
  } catch (err) {
    console.log('err. sites', err);
    res.status(500).send('could not find disabled sites list.');
  }
});

app.put('/site/disable/:cloud/:site', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { cloud } = req.params;
  const { site } = req.params;
  console.log(`disabling site ${site} in cloud ${cloud}`);

  try {
    const result = await rclient.sMembers(Keys.Sites);
    if (result) {
      console.log('found sites:', result);
      if (result.includes(`${cloud}:${site}`)) {
        await rclient.sAdd(Keys.DisabledSites, `${cloud}:${site}`);
        await rclient.publish('siteStatus', 'change');
        console.log('disabled site.');
        res.status(200).send('disabled site');
      } else {
        console.error('that site does not exist!');
        res.status(400).send('Site does not exist. Could not add site to disabled sites.');
      }
    } else {
      console.error('could not get Keys.Sites!');
    }
  } catch (err) {
    res.status(500).send('Internal issue');
  }
});

app.put('/site/enable/:cloud/:site', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { cloud } = req.params;
  const { site } = req.params;
  console.log(`enabling site ${site} in cloud ${cloud}`);
  if (disabled.has(site)) {
    try {
      const reply = await rclient.sRem(Keys.DisabledSites, `${cloud}:${site}`);
      console.log(`removed ${reply} site from disabled sites.`);
      await rclient.publish('siteStatus', 'change');
      res.status(200).send('OK');
    } catch (err) {
      console.error('could not remove from DisabledSites', err);
      res.status(500).send('Internal Issue');
    }
  } else {
    res.status(400).send('Site was not disabled!');
  }
});

app.put('/site/:cloud/:sitename/:cores', passport.authenticate('bearer', { session: false }), async (req, res) => {
  // console.log('adding a site....');
  const { cloud } = req.params;
  const site = req.params.sitename;
  const { cores } = req.params;

  console.log(`adding a site ${site} to ${cloud} cloud with ${cores} cores`);
  try {
    const numb = await rclient.sAdd(Keys.Sites, `${cloud}:${site}`);
    console.log('sites added:', numb);

    const reply = await rclient.set(`${cloud}:${site}`, cores);
    console.log('site added to cloud or updated: ', reply);

    updateGridVersion();
  } catch (err) {
    res.status(200).send('OK');
  }
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

  try {
    const sites = await rclient.sMembers(Keys.Sites);
    console.log('sites:', sites);

    const siteCores = await rclient.mGet(sites);
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
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/site/:cloud/:sitename', async (req, res) => {
  const site = `${req.params.cloud}:${req.params.sitename}`;

  console.log('looking up site:', site);

  try {
    const reply = await rclient.get(site);
    if (!reply) {
      console.log('not found');
      res.status(500).send('not found.');
    } else {
      console.log('found: ', reply);
      res.status(200).send(`Site found. Cores: ${reply}`);
    }
  } catch (err) {
    console.log('big error:', err);
    res.status(500).send('not found.');
  }
});

// completely deletes site
app.delete('/site/:cloud/:sitename', async (req, res) => {
  const site = `${req.params.cloud}:${req.params.sitename}`;
  console.log('deleting site:', site);
  try {
    const result = await rclient.del(site);
    console.log('sites deleted:', result);
    await rclient.sRem(Keys.Sites, site);
    updateGridVersion();
    res.status(200).send('OK');
  } catch (err) {
    console.error('could not delete sites', err);
    res.status(500).send('could not delete site');
  }
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
  try {
    const reply = await rclient.lRange(ds, 0, -1);
    if (!reply.length) {
      // console.log('not found');
      const replyMove = await rclient.rPopLPush(Keys.Unassigned, ds);
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
      // console.log('returning:', sites);
      res.status(200).send(sites);
    } else {
      const sites = reply[0].split(',');
      // console.log('found', sites);
      doc.sites = sites;
      doc.initial = false;
      esAddRequest(esIndexRequests, doc);
      res.status(200).send(sites);
    }
  } catch (err) {
    console.error('big error:', err);
    res.status(400).send(['other']);
  }
});

app.get('/ds/reassign/:dataset', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const ds = req.params.dataset;
  console.log('reassigning ds:', ds, 'in random way');
  try {
    const reply = rclient.blPop(Keys.Unassigned, 1000);
    if (!reply) {
      res.status(400).send('Timeout');
      return;
    }
    const sites = reply[1].split(',');
    await rclient.del(ds);
    await rclient.rPush(ds, sites);
    res.status(200).send(sites);
  } catch (err) {
    console.error('could not reassign. err:', err);
  }
});

// sites is given like AGLT2_VP_DISK,MWT2_VP_DISK,BNL_VP_DISK
app.put('/ds/reassign/:dataset/:sites', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { dataset } = req.params;
  const { sites } = req.params;
  console.log('reassigning ds:', dataset, 'to:', sites);
  // sites = sites.split(',');
  const reply1 = await rclient.del(dataset);
  if (!reply1) {
    console.log('that DS was not assigned before');
    res.status(400).send('that DS was not assigned before');
  }
  const reply2 = rclient.rPush(dataset, sites);
  if (!reply2) {
    res.status(400).send('Timeout');
  }
  res.status(200).send('Done.');
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

  const errMessage = 'Problem adding to serving topology.';
  try {
    const result = await rclient.hSet(Keys.ServingTopology, client, cacheSite);
    if (result > 0) {
      console.log('Added xcache to a client');
      await rclient.publish('topology', 'added');
    } else {
      console.error(errMessage);
      res.status(500).send(errMessage);
    }
  } catch (err) {
    console.error(errMessage);
    res.status(500).send(err);
  }
  res.status(200).send('OK');
});

// disallow serving given client
app.delete('/serve/:client', passport.authenticate('bearer', { session: false }), async (req, res) => {
  const { client } = req.params;
  console.info(`disallowing serving client: ${client}`);
  const errMessage = 'Problem when dissalowing serving.';
  try {
    const result = await rclient.hDel(Keys.ServingTopology, client);
    if (result === 0) {
      console.error(errMessage);
      res.status(500).send(errMessage);
    } else {
      await rclient.publish('topology', 'removed');
    }
  } catch (err) {
    console.error(errMessage);
    res.status(500).send(errMessage);
  }
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
  await rclient.publish('heartbeats', JSON.stringify(b));
  res.status(200).send('OK');
});

//
//                TEST, HEALTH, ERRORS and DEFAULTS
//

app.get('/test', async (_req, res) => {
  console.log('TEST starting...');

  try {
    let reply = await rclient.set('ds', 'TEST_OK');
    console.log(reply);

    reply = await rclient.get('ds');
    console.log(reply);

    reply = await rclient.del('ds');
    res.send(reply);
  } catch (err) {
    console.error('big error!');
  }
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
app.use((err, req, res) => {
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

  rclient.on('connect', async () => {
    console.log('redis connected OK.');
  }).on('error', (err) => {
    console.log(`Error ${err}`);
  });

  await rclient.connect();
  await subscriber.connect();

  try {
    es.ping((err, resp) => {
      console.log('ES ping:', resp.statusCode);
    });
  } catch (err) {
    console.error('server error: ', err);
  }

  // initializes value if it does not exist
  await rclient.setNX(Keys.GDV, '0');
  console.log('initialized GDV.');

  try {
    await reloadSiteStates();
    await reloadServingTopology();
    setInterval(backup, config.BACKUP_INTERVAL * 3600000);
    setInterval(cleanDeadServers, config.LIFETIME_INTERVAL * 1000);
  } catch (err) {
    console.error('Error: ', err);
  }

  await subscriber.subscribe('heartbeats', (message) => {
    console.log(`Received heartbeats message: ${message}`);
    try {
      const HB = JSON.parse(message);
      // console.log(HB);
      if (!(HB.site in cacheSites)) {
        cacheSites[HB.site] = {};
      }
      if (HB.id in cacheSites[HB.site]) {
        cacheSites[HB.site][HB.id] = HB; // this can't be combined.
      } else {
        cacheSites[HB.site][HB.id] = HB;
        recalculateCluster(HB.site);
      }
    } catch (err) {
      console.error('Error in Heartbeats handling: ', err);
    }
  });

  await subscriber.subscribe('topology', async (message) => {
    console.log(`Received topology message: ${message}`);
    await reloadServingTopology();
  });

  await subscriber.subscribe('siteStatus', async (message) => {
    console.log(`Received siteStatus message: ${message}`);
    await reloadSiteStates();
  });
}

main();
