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
const c = require('./choice');
const Keys = require('./keys');
const config = require('/etc/vps/config.json');

console.log('config:', config);

const rclient = redis.createClient({
  socket: {
    host: config.HOST,
    port: config.PORT,
  },
});

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
  try {
    const reply = await rclient.get(Keys.GDV);
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

    const sites = await rclient.sMembers(Keys.Sites);
    console.log('sites:', sites);

    const sdone = [];
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      console.log('looking up site:', site);
      const siteCores = await rclient.get(site);
      const [cloud, siteName] = site.split(':');
      if (!(cloud in grid.cores)) {
        grid.cores[cloud] = [];
      }
      grid.cores[cloud].push([siteName, Number(siteCores)]);
      sdone.push(i);
    }

    while (sdone.length < sites.length) {
      console.log(`not yet here. looked up ${sdone.length} from ${sites.length}.`);
      await sleep(5000);
    }

    console.log('all sites looked up');
    recalculateWeigths();

    // setTimeout(recalculateWeigths, 3000);

    // dropping previous unas values
    const removed = await rclient.del(Keys.Unassigned);
    console.log(`dropped ${removed} unassigned.`);
  } catch (err) {
    console.error('error caught in grid reload');
  }
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

async function fill() {
  if (!ready) return;
  const count = await rclient.lLen(Keys.Unassigned);
  console.log('unassigned :', count);
  if (count < config.PRECALCULATED_LWM) {
    for (let i = 0; i < config.PRECALCULATED_HWM - count; i++) {
      await rclient.lPush(Keys.Unassigned, generate());
    }
  }
  reloadGrid();
}

async function main() {
  rclient.on('connect', async () => {
    console.log('redis connected OK.');
  }).on('error', (err) => {
    console.log(`Error ${err}`);
  });

  await rclient.connect();

  await reloadGrid();
  // fills every 2 seconds
  setInterval(fill, 2000);
}

main();
