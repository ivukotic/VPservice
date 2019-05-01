var ready = false;

var grid = {
    grid_cores: 0,
    cloud_cores: [],
    cloud_weights: [],
    site_weights: {}
};

var grid_description_version = 1;

config = {
    "PORT": 6379,
    "HOST": "10.0.0.4"
}

console.log(config);

const redis = require('redis');
const rclient = redis.createClient(config.PORT, config.HOST); //creates a new client


function load_grid() {

    rclient.get('grid_cores', function (err, reply) {
        if (err) {
            console.log('err. grid_cores', err);
            return;
        }
        console.log('grid_cores:', reply);
        grid.grid_cores = Number(reply);
    });

    rclient.smembers('sites', function (err, sites) {
        if (err) {
            console.log('err. sites', err);
            return;
        }

        grid.cores = {};
        console.log('sites:', sites);
        for (si in sites) {
            site = sites[si]
            rclient.get(site, function (err, site_cores) {
                [cloud, site_name] = site.split(':');
                if (!(cloud in grid.cores)) {
                    grid.cores[cloud] = [];
                }
                grid.cores[cloud].push([site_name, site_cores]);
            });
        }
    });

}

function recalculate_weigths() {
    console.log(grid);
}

function recalculate_grid() {
    rclient.get('grid_description_version', function (err, reply) {
        console.log("GD version:", reply);
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

async function main() {
    try {
        await rclient.on('connect', function () {
            console.log('redis connected');
        });

        recalculate_grid();

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();