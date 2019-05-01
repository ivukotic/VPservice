// This code makes sure there is always more then 100 unassigned VPs in Radis. 

testing = false;
var ready = false;

var grid = {
    grid_cores: 0,
    cores: {},
    cloud_cores: [],
    cloud_weights: [],
    site_weights: {}
};

var grid_description_version = 1;

if (testing) {
    config = require('./kube/test_config.json');
}
else {
    config = require('/etc/vps/config.json');
}

console.log(config);

const redis = require('redis');
const rclient = redis.createClient(config.PORT, config.HOST); //creates a new client

var c = require('./choice.js');


async function recalculate_grid() {
    rclient.get('grid_description_version', async function (err, reply) {

        console.log("GD version:", reply);

        if (Number(reply) <= grid_description_version) {
            console.log('update not needed.');
            return;
        }

        ready = false;

        grid_description_version = Number(reply);
        console.log("Updating GD version to:", grid_description_version);
        await rclient.get('grid_cores', function (err, val) {
            grid.grid_cores = Number(val);
        });
        console.log('first try grid_cores:', grid.grid_cores);

        rclient.get('grid_cores', async function (err, reply) {
            if (err) {
                console.log('err. grid_cores', err);
                return;
            }
            console.log('grid_cores:', reply);

            grid.grid_cores = Number(reply);

            rclient.smembers('sites', async function (err, sites) {
                if (err) {
                    console.log('err. sites', err);
                    return;
                }

                grid.cores = {};
                console.log('sites:', sites);
                for (site in sites) {
                    site_cores = Number(await rclient.get(site));
                    [cloud, site_name] = site.split(':');
                    if (!grid.cores.includes(cloud)) {
                        grid.cores[cloud] = [];
                    }
                    grid.cores[cloud].append([site_name, site_cores]);
                }

                console.log(grid);

                if (grid.grid_cores == 0) {
                    return;
                }

                other = grid.grid_cores;
                for (cloud in grid.cores) {
                    sites = grid.cores[cloud]
                    console.log(cloud, sites)
                    cloud_cores = 0
                    for (sitei in sites) {
                        site = sites[sitei][0]
                        scores = sites[sitei][1]
                        console.log(sitei, site, scores)
                        cloud_cores += scores
                        other -= scores
                    }
                    grid.cloud_cores.push([cloud, cloud_cores])
                    console.log('--------------------')
                }
                grid.cloud_cores.push(['other', other])

                grid.cloud_weights = new c.WeightedList(grid.cloud_cores);
                for (cloud in grid.cores) {
                    sites = grid.cores[cloud]
                    console.log(cloud, sites)
                    grid.site_weights[cloud] = (new c.WeightedList(sites))
                }

                ready = true;

            });

        });



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
                // , function (err, reply) {
                // console.log('current length', reply);
                // }
                // )
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

        setInterval(fill, 2000);

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();