const { request } = require('https');
const newman = require('newman');
const fs = require('fs');
const reqs=require('requests');
const apiKey = fs.readFileSync('secrets/apikey.key')
const envUid = <ENV_UID_FROM_STEP_3>
const collectionLink = 'https://www.getpostman.com/collections/<ID_FROM_STEP_2>'
const envString = `https://api.getpostman.com/environments/${envUid}?apikey=${apiKey}`
newman.run({
    collection: collectionLink,
    reporters: 'cli',
    environment: envString
    }, (err) => {
    if (err) {
        console.log(err)
        throw err
    }
    console.log('all payments tests passed')
});