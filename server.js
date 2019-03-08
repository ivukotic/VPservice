var express = require('express');
// var https = require('https');
var http = require('http');

// var request = require('request');
// const JSONStream = require('json-stream'); need for events only

testing = false;

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
var rclient = redis.createClient(config.port, config.host); //creates a new client

var credentials = { key: privateKey, cert: certificate };

const app = express();

// app.use(express.json());       // to support JSON-encoded bodies

// async function get_user(id) {
// var user = new ent.User();
// user.id = id;
// await user.get();
// return user;
// }

app.get('/site/:sitename/:weight', async function (req, res) {
    var site = req.params.sitename;
    var weight = req.params.weight;

    console.log('adding a site to vp:', site, 'with weight', weight);

    rclient.set(site, weight, function (err, reply) {
        console.log(reply);
        res.status(400).send('set: ' + reply);
    });

});

app.get('/site/:sitename', async function (req, res) {
    var site = req.params.sitename;

    console.log('looking up site:', site);

    rclient.exists(site, function (err, reply) {
        if (reply == 0) {
            console.log('not found');
            res.status(400).send('not found.');
        } else {
            rclient.get(site, function (err, reply) {
                console.log("found: ", reply);
                res.status(400).send('found: ' + reply);
            });
        }
    });

});

app.get('/ds/:dataset', async function (req, res) {
    var ds = req.params.dataset
    console.log('ds to vp:', ds);

    rclient.exists(ds, function (err, reply) {
        console.log(reply);
        if (reply == 0) {
            console.log('not found');
            rclient.rpush([ds, 'aglt2', 'mwt2'], function (err, reply) {
                console.log(reply);
                res.status(400).send('not found. added');
            });
        } else {
            rclient.lrange(ds, 0, -1, function (err, reply) {
                console.log("found", reply);
                res.status(400).send('found: ' + reply);
            });
        }
    });
});


app.get('/test', async function (req, res) {
    console.log('TEST starting...');

    rclient.set('ds', 'ilija_ds', function (err, reply) {
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

        rclient.on('connect', function () {
            console.log('connected');
        });


        if (!testing) {
            // await LoadUpRedis();
        } else {
            rclient.set('ds', 'ilija_ds', function (err, reply) {
                console.log(reply);
            });

            rclient.get('ds', function (err, reply) {
                console.log(reply);
            });
        }

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();