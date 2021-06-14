# this code reads a list of VP datasets,
# deletes all entries (placed or not), that can't be accessed anymore.
# Three reasons for inaccessibility:
#    * no replicas at all
#    * only replicas on TAPE
#    * only replicas at RSEs that don't expose root protocol for WAN access

from rucio.client import Client
from rucio.rse import rsemanager as rsemgr
import redis

r = redis.Redis(host='redis-master.default.svc.cluster.local', port=6379, db=0)
c = Client(rucio_host="https://rucio-lb-int.cern.ch")

removed = 0
done = 0
had_replica = 0

#  scan over all keys
for k in r.scan_iter(match='*'):
    # print(k)
    ds = k.decode("utf-8").strip()
    if len(ds) < 30 or ds[0:5] == 'meta.':
        print("skipping key:", ds)
        continue

    try:
        scope, filen = ds.split(':')
        # print('----------------------------------------')
        # print(scope, filen)

        rr = c.list_dataset_replicas(scope, filen)
        accessible = False
        for i2 in rr:
            had_replica += 1
            # print(i2)
            rse = i2['rse']
            # print('replica:', rse)
            rse_info = rsemgr.get_rse_info(i2['rse'])
            if rse_info['rse_type'] == 'TAPE':
                # print('TAPE Skip.')
                continue
            # print(rse_info['protocols'])
            for prot in rse_info['protocols']:
                if prot['scheme'] == 'root' and prot['domains']['wan']['read'] > 0:
                    accessible = True
                    break
            if accessible:
                break

        if not accessible:
            # print('removing this one.', ds)
            r.delete(ds)
            removed += 1

    except Exception as identifier:
        print(ds)
        print(identifier)

    done += 1
    if not done % 10000:
        print("done:", done, "removed:", removed, 'had replica', had_replica)

print("done:", done)
print("removed:", removed)
