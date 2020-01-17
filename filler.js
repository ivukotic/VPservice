// This code makes sure there is always more then 100 unassigned VPs in Radis. 

var mode = process.env.MODE;

var ready = false;

var grid = {
    cloud_weights: [],
    site_weights: {}
};

var grid_description_version = 0;

if (mode == 'testing') {
    config = require('./kube/test_config.json');
}
else {
    config = require('/etc/vps/config.json');
}

console.log(config);

const redis = require('redis');
const rclient = redis.createClient(config.PORT, config.HOST); //creates a new client

var c = require('./choice.js');

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

function load_grid() {

    rclient.smembers('sites', function (err, sites) {
        if (err) {
            console.log('err. sites', err);
            return;
        }

        grid.cores = {};
        console.log('sites:', sites);

        (function next(index) {
            if (index === sites.length) { // No items left
                return;
            }
            var site = sites[index];
            rclient.get(site, function (err, site_cores) {
                [cloud, site_name] = site.split(':');
                if (!(cloud in grid.cores)) {
                    grid.cores[cloud] = [];
                }
                grid.cores[cloud].push([site_name, Number(site_cores)]);
                next(index + 1);
            });
        })(0);

    });

}

function recalculate_weigths() {
    console.log(grid);

    grid.cloud_cores = [];
    grid.cloud_weights = [];
    grid.site_weights = [];

    ready = false;
    for (cloud in grid.cores) {
        sites = grid.cores[cloud]
        console.log(cloud, sites)
        cloud_cores = 0
        for (sitei in sites) {
            site = sites[sitei][0]
            scores = sites[sitei][1]
            console.log(sitei, site, scores)
            cloud_cores += scores
        }
        grid.cloud_cores.push([cloud, cloud_cores])
        console.log('--------------------')
    }

    grid.cloud_weights = new c.WeightedList(grid.cloud_cores);
    for (cloud in grid.cores) {
        sites = grid.cores[cloud]
        console.log(cloud, sites)
        grid.site_weights[cloud] = (new c.WeightedList(sites))
    }

    ready = true;
}

async function recalculate_grid() {
    rclient.get('grid_description_version', async function (err, reply) {
        console.log("GD version:", reply);
        if (!reply || reply === '0') {
            console.log('grid description not there. will retry in 60 seconds.');
            await sleep(60000);
            await recalculate_grid();
            return;
        }
        if (Number(reply) <= grid_description_version) {
            console.log('update not needed.');
            return;
        }

        grid_description_version = Number(reply);
        console.log("Updating GD version to:", grid_description_version);

        load_grid();
        setTimeout(recalculate_weigths, 3000);

    });
}


function generate() {
    sel_cloud = grid.cloud_weights.peek()[0];
    if (sel_cloud === 'other') {
        return 'other';
    }

    ss = config.N;
    if (grid.cores[sel_cloud].length < ss) {
        ss = grid.cores[sel_cloud].length;
    }

    res = grid.site_weights[sel_cloud].peek(ss);
    console.log(sel_cloud, ss, res);
    return res.join(',');
}

function fill() {
    if (!rclient.connected) {
        rclient.on('connect', function () {
            console.log('connected');
        });
        return;
    }
    if (!ready) return;
    rclient.llen('unas', function (err, count) {
        console.log('count:', count)
        if (count < config.PRECALCULATED_LWM) {
            for (i = 0; i < config.PRECALCULATED_HWM - count; i++) {
                rclient.lpush('unas', generate());
            }
        }
        recalculate_grid();
    });
}

async function main() {
    try {
        await rclient.on('connect', function () {
            console.log('redis connected');
        });

        await recalculate_grid();
        // console.log(grid);
        // setInterval(recalculate_grid, 3600010);

        setInterval(fill, 2000); //fills every 2 seconds 

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();