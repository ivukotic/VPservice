var express = require('express');
// var https = require('https');
var http = require('http');

// var request = require('request');
// const JSONStream = require('json-stream'); need for events only

testing = true;

console.log('VPs server starting ... ');

console.log('config load ... ');
var config;
var privateKey;
var certificate;

if (testing) {
    config = require('./kube/test_config.json');
    // privateKey = fs.readFileSync('./kube/secrets/certificates/vps.key.pem');//, 'utf8'
    // certificate = fs.readFileSync('./kube/secrets/certificates/vps.cert.cer');
    // config.SITENAME = 'localhost'
}
else {
    config = require('/etc/vps/config.json');
    // privateKey = fs.readFileSync('/etc/https-certs/key.pem');//, 'utf8'
    // certificate = fs.readFileSync('/etc/https-certs/cert.pem');
}

console.log(config);

var redis = require('redis');
var rclient = redis.createClient(config.PORT, config.HOST); //creates a new client

var credentials = { key: privateKey, cert: certificate };

const app = express();

// app.use(express.json());       // to support JSON-encoded bodies

// async function get_user(id) {
// var user = new ent.User();
// user.id = id;
// await user.get();
// return user;
// }

// function backup() { This is blocked by Google.
//     console.log('Starting hourly backup...');

//     rclient.lastsave(function (err, reply) {
//         if (new Date() < (reply + 3600000)) {
//             console.log("last backup at less then one hour. Skipping.");
//             res.status(200).send('backup: skipped.');
//         } else {
//             rclient.bgsave(function (err, reply) {
//                 console.log(reply);
//                 res.status(200).send('backup: ' + reply);
//             });
//         };
//     });
// }



app.get('/site/:cloud/:sitename/:weight', async function (req, res) {
    var site = req.params.sitename;
    var weight = req.params.weight;

    console.log('adding a site to vp:', site, 'with weight', weight);

    rclient.set(cloud + ':' + site, weight, function (err, reply) {
        console.log(reply);
        res.status(200).send('set: ' + reply);
    });

});

app.get('/site/:cloud/:sitename', async function (req, res) {
    var site = req.params.sitename;

    console.log('looking up site:', site);

    rclient.exists(site, function (err, reply) {
        if (reply == 0) {
            console.log('not found');
            res.status(400).send('not found.');
        } else {
            rclient.get(site, function (err, reply) {
                console.log("found: ", reply);
                res.status(200).send('found: ' + reply);
            });
        }
    });

});

app.get('/ds/:sites/:dataset', async function (req, res) {
    var ds = req.params.dataset
    // console.log('ds to vp:', ds);

    rclient.exists(ds, function (err, reply) {
        if (reply == 0) {
            // console.log('not found');
            rclient.blpop('unas', 1000, function (err, reply) {
                if (!reply) {
                    res.status(400).send('Timeout');
                    return;
                }
                sites = reply[1].split(',')
                if (req.params.sites > 0) {
                    sites = sites.slice(0, req.params.sites)
                }
                rclient.rpush(ds, sites);
                res.status(200).send(sites);
            });
        } else {
            rclient.lrange(ds, 0, -1, function (err, reply) {
                // console.log("found", reply);
                res.status(200).send(reply);
            });
        }
    });
});


app.get('/test', async function (req, res) {
    console.log('TEST starting...');

    rclient.set('ds', 'TEST_OK', function (err, reply) {
        console.log(reply);
    });

    rclient.get('ds', function (err, reply) {
        console.log(reply);
        res.send(reply);
    });

});

app.get('/healthz', function (request, response) {
    console.log('healtcall');
    try {
        response.status(200).send('OK');
    } catch (err) {
        console.log("something wrong", err);
    }
});

app.use((err, req, res, next) => {
    console.error('Error in error handler: ', err.message);
    res.status(err.status).send(err.message);
});

app.get('/', (req, res) => res.send('Hello from the Virtual Placement Service.'))

app.listen(80, () => console.log(`Listening on port 80!`))

// var httpsServer = https.createServer(credentials, app).listen(443);

// // redirects if someone comes on http.
// http.createServer(
//     //     function (req, res) {
//     //     res.writeHead(302, { 'Location': 'https://' + config.SITENAME });
//     //     res.end();
//     // }
// ).listen(80);


async function main() {
    try {
        await rclient.on('connect', function () {
            console.log('connected');
        });

        // setInterval(backup, 3600000);
        // setInterval(backup, 86400000);

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();