// This code makes sure there is always more then 100 unassigned VPs in Radis.

const mode = process.env.MODE;
const redis = require('redis');
const c = require('./choice.js');

let ready = false;

const grid = {
  cores: {},
  cloud_weights: [],
  site_weights: {},
};

let gridDescriptionVersion = 0;
let config;

if (mode === 'testing') {
  config = require('./kube/test_config.json');
} else {
  config = require('/etc/vps/config.json');
}

console.log(config);

const rclient = redis.createClient(config.PORT, config.HOST);


function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function recalculateWeigths() {
  console.log(grid);

  grid.cloud_cores = [];
  grid.cloud_weights = [];
  grid.site_weights = [];

  ready = false;
  Object.keys(grid.cores).forEach((cloud) => {
    const sites = grid.cores[cloud];
    console.log(cloud, sites);
    let cloudCores = 0;
    sites.forEach((si) => {
      const [site, scores] = si;
      console.log(site, scores);
      cloudCores += scores;
    });
    grid.cloud_cores.push([cloud, cloudCores]);
    console.log('--------------------');
  });

  grid.cloud_weights = new c.WeightedList(grid.cloud_cores);
  Object.keys(grid.cores).forEach((cloud) => {
    const sites = grid.cores[cloud];
    console.log(cloud, sites);
    grid.site_weights[cloud] = (new c.WeightedList(sites));
  });

  ready = true;
}

// called at the startup
// if grid description not in redis, will retry every 60 seconds
async function recalculateGrid() {
  rclient.get('grid_description_version', async (err, reply) => {
    console.log('GD version:', reply);
    if (!reply || reply === '0') {
      console.log('grid description not there. will retry in 60 seconds.');
      await sleep(60000);
      await recalculateGrid();
      return;
    }
    if (Number(reply) <= gridDescriptionVersion) {
      console.log('update not needed.');
      return;
    }

    gridDescriptionVersion = Number(reply);
    console.log('Updating GD version to:', gridDescriptionVersion);


    rclient.smembers('sites', (err1, sites) => {
      if (err1) {
        console.log('err. sites', err1);
        return;
      }

      console.log('sites:', sites);

      (function next(index) {
        if (index === sites.length) { // No items left
          return;
        }
        var site = sites[index];
        rclient.get(site, (_err, site_cores) => {
          const [cloud, site_name] = site.split(':');
          if (!(cloud in grid.cores)) {
            grid.cores[cloud] = [];
          }
          grid.cores[cloud].push([site_name, Number(site_cores)]);
          next(index + 1);
        });
      })(0);
    });


    setTimeout(recalculateWeigths, 3000);
  });
}


function generate() {
  const selCloud = grid.cloud_weights.peek()[0];
  if (selCloud === 'other') {
    return 'other';
  }

  let ss = config.N;
  if (grid.cores[selCloud].length < ss) {
    ss = grid.cores[selCloud].length;
  }

  const res = grid.site_weights[selCloud].peek(ss);
  console.log(selCloud, ss, res);
  return res.join(',');
}

function fill() {
  if (!rclient.connected) {
    rclient.on('connect', () => {
      console.log('connected');
    });
    return;
  }

  if (!ready) return;
  rclient.llen('unas', (err, count) => {
    console.log('count:', count);
    if (count < config.PRECALCULATED_LWM) {
      for (let i = 0; i < config.PRECALCULATED_HWM - count; i++) {
        rclient.lpush('unas', generate());
      }
    }
    recalculateGrid();
  });
}

async function main() {
  try {
    await rclient.on('connect', () => {
      console.log('redis connected');
    });

    await recalculateGrid();
    // console.log(grid);
    // setInterval(recalculateGrid, 3600010);

    // fills every 2 seconds
    setInterval(fill, 2000);
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
