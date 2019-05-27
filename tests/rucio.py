from rucio.client import Client
c = Client(rucio_host='https://rucio-lb-int.cern.ch')
for i in range(100):
    r = c.list_dataset_replicas_vp('test', 'name_' + str(i))
    for j in r:
        print(i, j)
