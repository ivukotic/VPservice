// This code makes sure there is always more then 100 unassigned VPs in Radis. 

testing = true;

if (testing) {
    config = require('./kube/test_config.json');
}
else {
    config = require('/etc/vps/config.json');
}

console.log(config);

grid = require('./grid.json');
// console.log(grid);

var redis = require('redis');
var rclient = redis.createClient(config.PORT, config.HOST); //creates a new client

function recalculate_grid() {
    for (cloud in grid.cores) {
        sites = grid.cores[cloud]
        grid.cloud_weights[cloud] = 0
        grid.site_weights[cloud] = {}
        for (site in sites) {
            scores = sites[site]
            grid.cloud_weights[cloud] += scores
            grid.site_weights[cloud][site] = scores
        }
    }
    for (cloud in grid.site_weights) {
        sites = grid.site_weights[cloud]
        for (site in sites) {
            grid.site_weights[cloud][site] /= grid.cloud_weights[cloud]
        }
        grid.cloud_weights[cloud] /= grid.grid_cores
    }
}

function generate() {
    return 'asdf,asdf1,asdf2';
}

function fill() {
    if (!rclient.connected) {
        rclient.on('connect', function () {
            console.log('connected');
        });
        return;
    }
    rclient.llen('unas', function (err, count) {
        console.log('count:', count)
        if (count < config.PRECALCULATED_LWM) {
            for (i = 0; i < config.PRECALCULATED_HWM - count; i++) {
                rclient.lpush('unas', generate(), function (err, reply) {
                    console.log('current length', reply);
                })
            }
        }
    });
}

async function main() {
    try {

        recalculate_grid();
        console.log(grid);
        setInterval(recalculate_grid, 3600010);

        setInterval(fill, 60000);

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();