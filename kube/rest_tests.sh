curl vpservice.cern.ch
curl vpservice.cern.ch/healthz
curl vpservice.cern.ch/test

curl -XDELETE vpservice.cern.ch/grid

python initialize_grid.py

curl -X GET vpservice.cern.ch/grid

curl -XPUT vpservice.cern.ch/site/US/MWT2/1234
# curl -XDELETE vpservice.cern.ch/all_data

curl -X GET vpservice.cern.ch/ds/3/mc16_13TeV:mc16_13TeV.361107.PowhegPythia8EvtGen_AZNLOCTEQ6L1_Zmumu.merge.AOD.e3601_e5984_s3126_s3136_r11442_r10726_tid19450490_00