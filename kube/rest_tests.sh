curl vpservice.cern.ch
curl vpservice.cern.ch/healthz
curl vpservice.cern.ch/test

curl -XDELETE vpservice.cern.ch/grid

python initialize_grid.py

curl -X GET vpservice.cern.ch/grid

curl -XPUT vpservice.cern.ch/site/US/MWT2/1234
# curl -XDELETE vpservice.cern.ch/all_data

