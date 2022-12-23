const elasticsearch = require('@elastic/elasticsearch');
const redis = require('redis');
const Keys = require('../keys');

const testing = true;

console.log('dump starting ... ');

const configPath = './secret/config.json';

const config = require(configPath);
console.log(config);

const rclient = redis.createClient(config.PORT, config.HOST);
const es = new elasticsearch.Client({ node: config.ES_HOST, log: 'error' });

async function insert(data) {
  const result = await es.bulk({ index: 'vp_dump', body: data });
  console.log(result.statusCode);
}

async function storeInES() {
  rclient.keys('*', async (err, keys) => {
    if (err) return console.log(err);

    console.log('total keys', keys.length);

    const step = 1000;
    let count = 0;
    while (count < Math.floor(keys.length / step)) {
      data = [];
      st = count * step;
      et = (count + 1) * step;
      console.log(st, et);
      for (var i = st; i < et; i++) {
        const ds = keys[i];
        // console.log(ds);
        if (ds.length < 10) {
          console.log('skipping key', ds);
        }
        rclient.lRange(ds, 0, -1, async (err, reply) => {
          // console.log(ds, reply);
          if (err) {
            console.log('err. ', err);
            return;
          }
          plac = [];
          for (index = 0; index < reply.length; index++) {
            var si = reply[index].replace('_VP_DISK', '');
            plac.push(si);
          }
          const comb = plac.join('_');
          data.push({ index: {} }, { ds: ds, placement: plac, combination: comb });
        });
      }

      while (data.length < step) {
        await sleep(50);
      }

      await insert(data);
      data = [];
      count += 1;
    }
  });
}


async function getDisabled() {
  rclient.sMembers('meta.disabledSites', (err, disabled) => {
    if (err) {
      console.log('err. sites', err);
      return;
    }
    console.log('disabled sites', disabled);
  });
};

async function getGrid() {
  rclient.sMembers(Keys.Sites, (err, sites) => {
    if (err) {
      console.log('err. sites', err);
      return;
    }

    rclient.mGet(sites, (_err, site_cores) => {
      const cores = {};
      for (i in sites) {
        [cloud, site_name] = sites[i].split(':');
        if (!(cloud in cores)) {
          cores[cloud] = [];
        }
        cores[cloud].push([site_name, Number(site_cores[i])]);
      }
      // return cores;
      console.log(cores);
    });
  });
};

async function getPlacement(dataset) {
  const ds = dataset;
  console.log('ds to vp:', ds);
  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) {
      console.log('not found');
    } else {
      rclient.lRange(ds, 0, -1, (err, reply) => {
        console.log("found", reply);
        return;
      });
    }
  });
};

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  try {
    await rclient.on('connect', () => {
      console.log('connected');
    });
  } catch (err) {
    console.error('Error: ', err);
  }
  await sleep(300);
  try {
    await es.ping((err, resp, status) => {
      console.log('ES ping:', resp.statusCode);
    });
  } catch (err) {
    console.error('Error: ', err);
  }

  await sleep(300);

  const grid = await getGrid();

  await sleep(300);
  const disabled = await getDisabled();

  await sleep(300);

  console.log('indexing...');
  storeInES();

}

main();
