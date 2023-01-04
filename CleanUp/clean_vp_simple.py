# deletes only datasets matching simple patterns.
import redis
import time

r = redis.Redis(host='redis-master.default.svc.cluster.local', port=6379, db=0)
total_keys = r.dbsize()
print('total keys', total_keys)

removed = 0
checked = 0

#  scan over all keys
for k in r.scan_iter(match='*'):
    # print(k)

    checked += 1
    if r.type(k) != b'list':
        print('not a list:', k)
        continue

    ds = k.decode("utf-8").strip()
    if len(ds) < 30 or ds[0:5] == 'meta.':
        print("skipping key:", ds)
        continue

    if ds.startswith('panda:panda.um.'):
        r.delete(ds)
        removed += 1
        continue

    v = r.lrange(k, 0, -1)
    if b"ATLAS_VP_DISK" in v:
        r.ltrim(k, 0, 10)
        removed += 1
        continue

    if not checked % 1000:
        print("done:", checked, "removed:", removed)
        time.sleep(10)
print("done:", checked, "removed:", removed)

total_keys = r.dbsize()
print('total keys', total_keys)
