# deletes only datasets matching simple patterns.
import redis

r = redis.Redis(host='redis-master.default.svc.cluster.local', port=6379, db=0)

removed = 0
checked = 0

#  scan over all keys
for k in r.scan_iter(match='*'):
    # print(k)

    checked += 1

    ds = k.decode("utf-8").strip()
    if len(ds) < 30 or ds[0:5] == 'meta.':
        print("skipping key:", ds)
        continue

    if ds.startswith('panda:panda.um.'):
        r.delete(ds)
        removed += 1
        continue

    v = r.get(k)
    if "ATLAS_VP_DISK" in v:
        r.delete(ds)
        removed += 1
        continue

    if not checked % 10000:
        print("done:", checked, "removed:", removed)

print("done:", checked, "removed:", removed)
