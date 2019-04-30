import requests
import time
import random

N = 1000
print('starting test...')
host = 'http://vpservice.cern.ch/'
st = time.time()
for i in range(N):
    rn = random.randint(0, 10000)
    r = requests.get(host + 'ds/5/test_' + str(rn))
    if r.status_code != 200:
        print(r.status_code)
    print(r.text)
    # time.sleep(.01)
print('it took:', time.time() - st)
