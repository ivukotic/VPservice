import requests
import time
import random

testing = True

N = 300
print('starting test...')

if testing:
    host = 'http://localhost/'
else:
    host = 'http://vpservice.cern.ch/'

st = time.time()
for i in range(N):
    rn = random.randint(0, 100)
    r = requests.get(host + 'ds/6/test1_' + str(rn))
    if r.status_code != 200:
        print(r.status_code)
    if r.text == '["other"]':
        # if len(r.text) == 1 and r.text[0] == 'other':
        continue
    print(r.text)
    # time.sleep(.01)
print('it took:', time.time() - st)
