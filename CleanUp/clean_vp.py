# this code reads a list of VP datasets,
# deletes all entries (placed or not), that can't be accessed anymore.
# Three reasons for inaccessibility:
#    * no replicas at all
#    * only replicas on TAPE
#    * only replicas at RSEs that don't expose root protocol for WAN access

from rucio.client import Client
from rucio.rse import rsemanager as rsemgr
import requests

c = Client(rucio_host="https://rucio-lb-int.cern.ch")
vp_address = 'http://vpservice.cern.ch/'

# loading keys and values
keys = open("keys.txt", "r").readlines()
values = open("values.txt", "r").readlines()

print('total keys:', len(keys))

removed = 0
done = 0

for i in range(len(keys)):
    ds = keys[i].strip()
    if len(ds) < 30:
        print "skipping key:", ds
        continue

    scope, filen = ds.split(':')
    print '----------------------------------------'
    print scope, filen
    try:
        rr = c.list_dataset_replicas(scope, filen)
        accessible = False
        for i2 in rr:
            # print i2
            rse = i2['rse']
            print 'replica:', rse
            rse_info = rsemgr.get_rse_info(i2['rse'])
            if rse_info['rse_type'] == 'TAPE':
                print 'TAPE Skip.'
                continue
            # print rse_info['protocols']
            for prot in rse_info['protocols']:
                if prot['scheme'] == 'root' and prot['domains']['wan']['read'] > 0:
                    accessible = True
                    break
            if accessible:
                break

        if not accessible:
            print 'removing this one.\n'
            r = requests.delete(vp_address + 'ds/' + ds)
            if r.status_code != 200:
                print(r.status_code)
            removed += 1

    except Exception as identifier:
        print identifier
        pass
    done += 1
    if not done % 100:
        print "done:", done

print "removed:", removed
