const elasticsearch = require('@elastic/elasticsearch');
const { range } = require('lodash');
const { run } = require('newman');
const ES_HOST="https://vpindexer:r5t6y7u8@atlas-kibana.mwt2.org:9200"

const esIndexRequests = 'test_virtual_placement';
const esIndexLiveness = 'test_vp_liveness';
const esIndexLookups = 'test_vp_lookups';

let esData = []; // buffer to hold a batch of ES reporting data.
let inProgress = false;
const batchSize = 3;

const es = new elasticsearch.Client({ node: ES_HOST, log: 'error' });

function esAddRequest(index, doc) {
  console.log('insert', esData.length, inProgress);
  esData.push({ index: {_index: index} }, doc);
  // for each doc added arrays grows by 2
  if (esData.length > batchSize * 2 && inProgress === false) {
    inProgress = true;

    console.log(esData);
    console.log('INDDDDEX', index);
    es.bulk(
      { body: esData.slice(0, batchSize * 2) },
      (err, result) => {
        if (err) {
          console.error('ES indexing failed\n', err);
          console.log('dropping data.');
          esData = [];
        } else {
          console.log('ES indexing done in', result.body.took, 'ms');
          esData = esData.slice(batchSize * 2);
        }
        inProgress = false;
      },
    );
  }
}

function addlivenes(i) {
  const doc = {};
  doc.server = 'asdf';
  doc.live = false;
  doc.i = i;
  doc.timestamp = Date.now();
  esAddRequest(esIndexLiveness, doc);
}

function addrequest(i) {
  const doc = {};
  doc.server = 'asdf';
  doc.request = 'adsfasdf';
  doc.i = i;
  doc.timestamp = Date.now();
  esAddRequest(esIndexRequests, doc);
}

async function runs() {
  for (let i = 0; i < 22; i++) {
    addlivenes(i);
    addrequest(i);
    await new Promise(r => setTimeout(r, 1000));
  }
}

runs()