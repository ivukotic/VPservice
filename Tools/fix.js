const redis = require('redis');
const keys = require('../keys');

config = {
  PORT: 6379,
  HOST: 'redis-master.default.svc.cluster.local',
};

const test_keys = [
  'mc16_13TeV:mc16_13TeV.361239.Pythia8EvtGen_A3NNPDF23LO_minbias_inelastic_high.simul.HITS.e4981_s3087_s3111_tid10701335_00',
  'panda:panda.um.user.amoohamm.METPerformance.data.DAOD_JETM3.Nominal.20191210_ZeeEventsLoose.data2018.Zee.v0.41_EMT.log.287688364',
  'mc16_13TeV:mc16_13TeV.312020.Pythia8EvtGen_A14NNPDF23LO_EJ_ModelB_1400_150_4jetFilter.simul.HITS.e7941_e5984_s3126_tid20090961_00',
  'panda:panda.um.user.abiondin.3Dec2019.00349637.f937_m1979_p3930_LJDisplacedPackageRun2.root.284724233',
  'panda:panda.um.user.alory.data16_13TeV.AllYear.r9264_p3083_p4030.xAH.1_AnalysisVariables.root.287721197',
  'panda:panda.um.user.kkrizka.mc16a.Sherpa_Wtaunu.fatjet.20191204-01_hist.285122179',
  'panda:panda.um.user.mpettee.1.mc16_13TeV.364160.Sh221_PDF30_Wmunu_MV70_140_CFBV.D1.e5340_s3126_r9364_p3749.c.log.287634402',
  'mc16_13TeV:mc16_13TeV.410644.PowhegPythia8EvtGen_A14_singletop_schan_lept_top.deriv.DAOD_SUSY7.e6527_e5984_s3126_r10724_r10726_p3703_tid16141402_00',
  'panda:panda.um.user.ychiu.20191215_ce7bd8f4_p94_U.ZdZd13TeV.data2017_NTUP4L.287637795',
  'panda:panda.um.group.phys-higgs.Htt_hh_MMC1.mc16_13TeV.344782.Sh221_PDF30_Ztt_MV140_280_h30h20.D3.e5585_s3126_r9364_p3978.smPre_w_0_HS.286607928',
  'mc16_13TeV:mc16_13TeV.397570.MGPy8EG_A14N23LO_GG_2500_2490_LLE12k.deriv.DAOD_SUSY2.e7304_e5984_a875_r10201_r10210_p3992_tid19531222_00',
];

const rclient = redis.createClient(config.PORT, config.HOST);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function rename_site(ds, placements, origSite = 'MWT2_DATADISK', newSite = 'MWT2_VP_DISK') {
  const pos = placements.indexOf(origSite);
  // console.log(placements, pos);
  if (pos !== -1) {
    placements[pos] = newSite;
    console.log('new placement', placements);
    rclient.lTrim(ds, 1, 0); // removes all
    rclient.rPush(ds, placements);
  }
}

function replace_combination(ds, placements, origCombo = ['other', 'other', 'other'], newCombo = ['other']) {
  if (origCombo.length != placements.length) return;
  for (ind = 0; ind < placements.length; ind++) {
    if (placements[ind] != origCombo[ind]) {
      return;
    }
  }
  console.log('replaced with', newCombo);
  rclient.lTrim(ds, 1, 0); // removes all
  rclient.rPush(ds, newCombo);
}

function remove_large(ds, placements) {
  console.log(placements, placements.length);
  if (placements.length > 10) {
    rclient.del(ds);
  }
}

async function test_fix() {
  console.log('total keys', test_keys.length);

  let count = 0;
  while (count < test_keys.length) {
    const ds = test_keys[count];
    // console.log(ds);
    if (ds.length < 10) {
      console.log('skipping key', ds);
    }
    rclient.lRange(ds, 0, -1, async (err, reply) => {
      console.log(ds, reply);
      if (err) {
        console.log('err. ', err);
        return;
      }

      // rename_site(ds, reply);
      // replace_combination(ds, reply);
      remove_large(ds, reply);
    });

    count += 1;
  }
}

async function fix() {
  rclient.keys('*', async (err, keys) => {
    if (err) return console.log(err);

    console.log('total keys', keys.length);

    let count = 0;
    while (count < keys.length) {
      const ds = keys[count];
      // console.log(ds);
      if (ds.length < 10) {
        console.log('skipping key', ds);
      }
      rclient.lRange(ds, 0, -1, async (err, reply) => {
        // console.log(ds, reply);
        if (err) {
          console.log('err. ', err);
          return;
        }

        remove_large(ds, reply);
        // rename_site(ds, reply);
        // replace_combination(ds,reply);
      });

      count += 1;
      if (count % 100 === 0) {
        console.log('done:', count);
        await sleep(60);
      }
    }
  });
}

async function getDisabled() {
  rclient.sMembers('meta.disabledSites', (err, disabled) => {
    if (err) {
      console.log('err. sites', err);
      return;
    }
    console.log('disabled sites', disabled);
  });
}

async function getGrid() {
  rclient.sMembers(keys.Sites, (err, sites) => {
    if (err) {
      console.log('err. sites', err);
      return;
    }

    rclient.mGet(sites, (_err, site_cores) => {
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
}

async function getPlacement(dataset) {
  const ds = dataset;
  console.log('ds to vp:', ds);
  rclient.exists(ds, (_err, reply) => {
    if (reply === 0) {
      console.log('not found');
    } else {
      rclient.lRange(ds, 0, -1, (err, reply) => {
        console.log('found', reply);
      });
    }
  });
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

  // const grid = await getGrid();

  // await sleep(300);

  // const disabled = await getDisabled();

  // await sleep(300);

  console.log('fixing...');
  fix();
  // test_fix();
}

main();
