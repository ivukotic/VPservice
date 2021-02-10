// This code makes sure there is always more then 100 unassigned VPs in Radis.

/*
each 2 seconds checks if there is less than LWM in unas.
if yes, generates more.
after each fill up checks if it needs to reload Grid description.
if grid reload needed, it will clean up all unas.
every restart dropps all unassigned.
if grid is reset the new setting will reload it.
Weights - there are cloud weights and site weights.

*/

const redis = require('redis');
const c = require('./choice.js');
const config = require('/etc/vps/config.json');

console.log('config:', config);

const rclient = redis.createClient(config.PORT, config.HOST);

let ready = false;
let gridDescriptionVersion = 0;
const grid = {};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resetGrid() {
  grid.cores = {};
  grid.cloud_cores = [];
  grid.cloud_weights = [];
  grid.site_weights = [];
}

function recalculateWeigths() {
  console.log('new grid:', grid);

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
async function reloadGrid() {
  rclient.get('Meta.grid_description_version', async (err, reply) => {
    // console.log('GD version:', reply);
    if (!reply || reply === '0') {
      console.log('grid description not there. will retry in 60 seconds.');
      await sleep(60000);
      await reloadGrid();
      return;
    }

    if (Number(reply) === gridDescriptionVersion) {
      // console.log('update not needed.');
      return;
    }

    console.log(`Current grid version: ${gridDescriptionVersion} needs an update.`);
    gridDescriptionVersion = Number(reply);
    console.log('Updating GD version to:', gridDescriptionVersion);

    ready = false;
    resetGrid();
    await rclient.smembers('Meta.Sites', async (err1, sites) => {
      if (err1) {
        console.log('err. sites', err1);
        return;
      }

      console.log('sites:', sites);

      const sdone = [];
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        console.log('looking up site:', site);
        await rclient.get(site, (err2, siteCores) => {
          if (err2) {
            console.error('error in getting site:', site, err2);
          }
          const [cloud, siteName] = site.split(':');
          if (!(cloud in grid.cores)) {
            grid.cores[cloud] = [];
          }
          grid.cores[cloud].push([siteName, Number(siteCores)]);
          sdone.push(i);
        });
      }
      while (sdone.length < sites.length) {
        console.log(`not yet here. looked up ${sdone.length} from ${sites.length}.`);
        await sleep(5000);
      }
      console.log('all sites looked up');
      recalculateWeigths();
    });

    // setTimeout(recalculateWeigths, 3000);

    // dropping previous unas values
    rclient.del('unas', (err1, removed) => {
      if (err1) {
        console.error('issue when deleting unas', err1);
        return;
      }
      console.log(`dropped ${removed} unassigned.`);
    });
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
  // console.log('cloud:', selCloud, 'nsites:', ss, 'throw:', res);
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
    console.log('unassigned :', count);
    if (count < config.PRECALCULATED_LWM) {
      for (let i = 0; i < config.PRECALCULATED_HWM - count; i++) {
        rclient.lpush('unas', generate(), (err1) => {
          if (err1) {
            console.error('error adding new unas.');
          }
          // console.log('after adding. unassigned:', numb);
        });
      }
    }
    reloadGrid();
  });
}

async function main() {
  try {
    rclient.on('connect', async () => {
      console.log('redis connected');
      await reloadGrid();
      // fills every 2 seconds
      setInterval(fill, 2000);
    });
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
