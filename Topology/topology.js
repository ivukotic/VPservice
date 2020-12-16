const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const redis = require('redis');
const config = require('/etc/vps/config.json');
const espath = require('/etc/vps/es-conn.json');

const app = express();

console.log('VPs topology server starting ... ');
console.log('config: ', config);

const rclient = redis.createClient(config.PORT, config.HOST);

const es = new elasticsearch.Client({ node: espath.ES_HOST, log: 'error' });

let disabled = new Set();
let paused = false;

// ES reporting things
let esData = []; // buffer to hold a batch of ES reporting data.
let inProgress = false;
const batchSize = 100;
let esIndex = 'vp_liveness';
if (config.TESTING) {
  esIndex = 'test_vp_liveness';
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
app.post('/liveness', async (req, res) => {
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

app.get('/healthz', (_request, response) => {
  console.log('health call');
  try {
    response.status(200).send(`OK v${process.env.npm_package_version}`);
  } catch (err) {
    console.log('something wrong', err);
    response.status(400).send(err);
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

    // loads disabled sites
    rclient.smembers('disabled_sites', (_err, reply) => {
      console.log('Disabled sites:', reply);
      disabled = new Set(reply);
    });

  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
