from rucio.client import Client
import requests

c = Client(rucio_host="https://rucio-lb-int.cern.ch")

# loading keys and values
keys = open("keys.txt", "r").readlines
values = open("values.txt", "r").readlines

placed = []
for i in len(keys):
    if len(keys[i]) < 10:
        print(keys[i])
        break
    if values[i] != 'other':
        print(keys[i], values[i])
        placed.append([keys[i], values[i]])

print('total:', len(keys), 'placed:', len(placed))

# scope = r["scope"]
# filen = r["filename"]
# try:
#     gj = c.list_parent_dids(scope, filen)
#     ds = gj.next()
#     if ds["type"] != "DATASET":
#         continue
#     dss = ds['scope']
#     dsn = ds['name']
#     # print(count, dss, dsn)
#     r = c.list_dataset_replicas_vp(dss, dsn)
#     for i1 in r:
#         if i1['vp']:
#             print(count, dss, dsn, i1)
# except Exception as identifier:
#     pass

# r = requests.get(host + 'ds/6/test1_' + str(rn))
# if r.status_code != 200:
#     print(r.status_code)
