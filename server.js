// var fs = require('fs');
var express = require('express');
var https = require('https');
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
    config = require('./kube/config.json');
    // privateKey = fs.readFileSync('./kube/secrets/certificates/gates.key.pem');//, 'utf8'
    // certificate = fs.readFileSync('./kube/secrets/certificates/gates.cert.cer');
    // config.SITENAME = 'localhost'
}
else {
    config = require('/etc/gates/config.json');
    // privateKey = fs.readFileSync('/etc/https-certs/key.pem');//, 'utf8'
    // certificate = fs.readFileSync('/etc/https-certs/cert.pem');
}

console.log(config);

var redis = require('redis');
var rclient = redis.createClient(config.port, config.host); //creates a new client

var credentials = { key: privateKey, cert: certificate };

const app = express();

// app.use(express.json());       // to support JSON-encoded bodies

async function get_user(id) {
    // var user = new ent.User();
    // user.id = id;
    // await user.get();
    // return user;
}


// app.get('/delete/:jservice', requiresLogin, function (request, response) {
//     var jservice = request.params.jservice;
//     cleanup(jservice);
//     response.redirect("/index.html");
// });

// app.get('/log/:podname', requiresLogin, async function (request, response) {
//     var podname = request.params.podname;
//     plog = await get_log(podname);
//     console.log(plog.body);
//     response.render("podlog", { pod_name: podname, content: plog.body });
// });


app.get('/healthz', function (request, response) {
    try {
        response.status(200).send('OK');
    } catch (err) {
        console.log("something wrong", err);
    }
});

// app.get('/get_services_from_es/:servicetype', async function (req, res) {
//     console.log(req.params);
//     var servicetype = req.params.servicetype;
//     console.log('user:', req.session.user_id, 'service:', servicetype);
//     var user = await get_user(req.session.user_id);
//     var services = await user.get_services(servicetype);
//     console.log(services);
//     res.status(200).send(services);
// });


app.get('/login', (request, response) => {
    console.log('Logging in');
    red = `${gConfig.AUTHORIZE_URI}?scope=urn%3Aglobus%3Aauth%3Ascope%3Aauth.globus.org%3Aview_identities+openid+email+profile&state=garbageString&redirect_uri=${gConfig.redirect_link}&response_type=code&client_id=${gConfig.CLIENT_ID}`;
    // console.log('redirecting to:', red);
    response.redirect(red);
});



app.get('/test', async function (req, res) {
    console.log('TEST starting...');
    console.log('User...');
    // create user
    u = new ent.User();
    u.name = "test user";
    u.organization = "test organization";
    u.username = "testUser";
    u.email = "testUser@test.organization.org";
    u.create();

    t = new ent.Team();
    t.name = "test team";
    t.desription = "test description";
    t.create();
    res.render("index");
});

// app.get('/authorize/:user_id', async function (req, res) {
//     console.log('Authorizing user...');
//     var user = await get_user(req.params.user_id);
//     user.approve();
//     res.redirect("/users.html");
// });


app.use((err, req, res, next) => {
    console.error('Error in error handler: ', err.message);
    res.status(err.status).send(err.message);
});


var httpsServer = https.createServer(credentials, app).listen(443);

// redirects if someone comes on http.
http.createServer(function (req, res) {
    res.writeHead(302, { 'Location': 'https://' + config.SITENAME });
    res.end();
}).listen(80);


async function main() {
    try {

        rclient.on('connect', function () {
            console.log('connected');
        });


        if (!testing) {
            // await LoadUpRedis();
        } else {
            rclient.set('framework', 'AngularJS', function (err, reply) {
                console.log(reply);
            });

            rclient.get('framework', function (err, reply) {
                console.log(reply);
            });
        }

    } catch (err) {
        console.error('Error: ', err);
    }
}

main();