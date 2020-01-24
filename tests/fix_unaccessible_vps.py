from rucio.client import Client
import requests

c = Client(rucio_host="https://rucio-lb-int.cern.ch")
vp_address = 'http://vpservice.cern.ch/'

# loading keys and values
keys = open("keys.txt", "r").readlines()
values = open("values.txt", "r").readlines()

placed = []
for i in range(len(keys)):
    ds = keys[i].strip()
    sites = values[i].strip()
    if len(ds) < 30:
        print(ds)
        continue
    if sites != 'other':
        # print ds, sites
        placed.append([ds, sites])

print('total:', len(keys), 'placed:', len(placed))

done = 0
for ds, cp in placed:
    scope, filen = ds.split(':')
    print('----------------------------------------')
    print scope, filen
    try:
        r = c.list_dataset_replicas_vp(scope, filen)
        isVP = False
        for i1 in r:
            if i1['vp']:
                isVP = True
            break

        if isVP != True:
            print "Not VP. Skipping."
            continue

        rr = c.list_dataset_replicas(scope, filen)
        accessible = False
        for i2 in rr:
            if i2['rse'].count('TAPE'):
                continue
            if i2['rse'].count('SFU'):
                continue
            accessible = True
            break

        if not accessible:
            print 'removing this one.\n', rr
            r = requests.delete(vp_address + 'ds/' + ds)
            if r.status_code != 200:
                print(r.status_code)

    except Exception as identifier:
        print identifier
        pass
    done += 1

    if done > 10:
        break
