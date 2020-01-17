const redis = require('redis');

const testing = true;

console.log('dump starting ... ');

const configPath = './secret/config.json';

const config = require(configPath);
console.log(config);

const rclient = redis.createClient(config.PORT, config.HOST);

async function fakefix() {

  keys = [
    "user.hteagle:user.hteagle.MC15.311161.MGPy8EG_A14N23LO_2HDMtW_a350_DM10_H500_tb1_1L0L_V1UP_DAOD_TRUTH_v1_EXT0.281047465",
    "panda:panda.um.group.perf-muons.data18_13TeV.periodO.physics_Main.PhysCont.DAOD_MUON1.grp18_v01_p3583_v062_EXT0.287732526",
    "mc16_13TeV:mc16_13TeV.312020.Pythia8EvtGen_A14NNPDF23LO_EJ_ModelB_1400_150_4jetFilter.simul.HITS.e7941_e5984_s3126_tid20090961_00",
    "panda:panda.um.user.sakatsuk.Wjets.364184.e5340_s3126_r10201_p3652_v2.8d2_noSys_t2_tree.root.285292696",
    "panda:panda.um.user.alory.data16_13TeV.AllYear.r9264_p3083_p4030.xAH.1_AnalysisVariables.root.287721197",
    "panda:panda.um.user.kkrizka.mc16a.Sherpa_Wtaunu.fatjet.20191204-01_hist.285122179",
    "panda:panda.um.user.mpettee.1.mc16_13TeV.364160.Sh221_PDF30_Wmunu_MV70_140_CFBV.D1.e5340_s3126_r9364_p3749.c.log.287634402",
    "mc16_13TeV:mc16_13TeV.410644.PowhegPythia8EvtGen_A14_singletop_schan_lept_top.deriv.DAOD_SUSY7.e6527_e5984_s3126_r10724_r10726_p3703_tid16141402_00",
    "panda:panda.um.user.ychiu.20191215_ce7bd8f4_p94_U.ZdZd13TeV.data2017_NTUP4L.287637795",
    "panda:panda.um.group.phys-higgs.Htt_hh_MMC1.mc16_13TeV.344782.Sh221_PDF30_Ztt_MV140_280_h30h20.D3.e5585_s3126_r9364_p3978.smPre_w_0_HS.286607928"
  ]

  console.log('total keys', keys.length)

  let count = 0;
  while (count < keys.length) {

    const ds = keys[count];
    // console.log(ds);
    if (ds.length < 10) {
      console.log('skipping key', ds)
    }
    rclient.lrange(ds, 0, -1, async (err, reply) => {
      console.log(ds, reply);
      if (err) {
        console.log('err. ', err);
        return;
      }
      placement = [];
      for (index = 0; index < reply.length; index++) {
        var si = reply[index];//.replace('_DATADISK', '');
        placement.push(si);
      }
      // rclient.rpush(ds, placement);
    });

    count += 1;
  }
}


async function fix() {

  rclient.keys('*', async function (err, keys) {
    if (err) return console.log(err);

    console.log('total keys', keys.length)

    let count = 0;
    // while (count < keys.length) {
    while (count < 10) {

      const ds = keys[count];
      // console.log(ds);
      if (ds.length < 10) {
        console.log('skipping key', ds)
      }
      rclient.lrange(ds, 0, -1, async (err, reply) => {
        console.log(ds, reply);
        if (err) {
          console.log('err. ', err);
          return;
        }
        placement = [];
        for (index = 0; index < reply.length; index++) {
          var si = reply[index];//.replace('_DATADISK', '');
          placement.push(si);
        }
        rclient.rpush(ds, placement);
      });

      count += 1;

    }

  });

}


async function getDisabled() {

  rclient.smembers('disabled_sites', (err, disabled) => {
    if (err) {
      console.log('err. sites', err);
      return;
    }
    console.log('disabled sites', disabled);
    return;
  });

};

async function getGrid() {

  rclient.smembers('sites', (err, sites) => {
    if (err) {
      console.log('err. sites', err);
      return
    }

    rclient.mget(sites, (_err, site_cores) => {
      const cores = {};
      for (i in sites) {
        [cloud, site_name] = sites[i].split(':');
        if (!(cloud in cores)) {
          cores[cloud] = [];
        }
        cores[cloud].push([site_name, Number(site_cores[i])]);
      }
      // return cores;
      console.log(cores);
    });
  });
};

async function getPlacement(dataset) {
  const ds = dataset;
  console.log('ds to vp:', ds);
  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) {
      console.log('not found');
    } else {
      rclient.lrange(ds, 0, -1, (err, reply) => {
        console.log("found", reply);
        return;
      });
    }
  });
};

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function main() {
  try {
    await rclient.on('connect', () => {
      console.log('connected');
    });
  } catch (err) {
    console.error('Error: ', err);
  }

  await sleep(300);

  try {
    await es.ping(function (err, resp, status) {
      console.log('ES ping:', resp.statusCode);
    });
  } catch (err) {
    console.error('Error: ', err);
  }

  await sleep(300);

  const grid = await getGrid()

  await sleep(300);

  const disabled = await getDisabled();

  await sleep(300);

  console.log('fixing...');
  fakefix();

}

main();
