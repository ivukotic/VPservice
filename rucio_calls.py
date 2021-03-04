import requests
from struct import unpack
from hashlib import sha256

examples = [
    ['MWT2', 'abcdf.root'],
    ['AGLT2', 'abcdf.root'],
    ['AGLT2', 'abcdfsdfasd.root'],
    ['AGLT2', 'fdsabasdfcdf.root'],
    ['UCT3', 'somefile.asdf'],
    ['BCD', 'anptjer.file'],
    ['aCD', 'anptjer.file'],
]

clientSite2cacheSite = None
XCaches = None

VPendpoint = 'https://vps.cern.ch/serverRanges'


def initializeSite2XCacheSiteMap():
    global clientSite2cacheSite
    clientSite2cacheSite = {
        'AGLT2': 'AGLT2',
        'MWT2': 'MWT2',
        'UCT3': 'AGLT2',
        'BCD': 'Internet2',
    }
    print('Initialized client 2 cache map.')


def getXCacheSiteInfo():
    global XCaches
    response = requests.get(VPendpoint, verify=False)
    if response:
        print('Success! Got XCache ranges.')
        XCaches = response.json()
        print(XCaches)
    else:
        print('An error has occurred.')


def getServer(xcacheSite, filename):
    print(xcacheSite, filename)
    h = float(
        unpack('Q', sha256(filename.encode('utf-8')).digest()[:8])[0]) / 2**64
    print('hash:', h)
    for range in xcacheSite['ranges']:
        if h < range[1]:
            print('server:', range[0])
            return 'root://' + xcacheSite['servers'][range[0]][0]


# initialize with CRIC client xcache mapping
initializeSite2XCacheSiteMap()

# periodically (every 1 min) get info on caches from VP.
getXCacheSiteInfo()

# for each example get prefix
for [clientSite, filename] in examples:
    print("looking up:", clientSite, filename)
    if clientSite in clientSite2cacheSite:
        cacheSite = clientSite2cacheSite[clientSite]
        print('maps to:', cacheSite, 'cache site')
        if cacheSite in XCaches:
            print(getServer(XCaches[cacheSite], filename))
        else:
            print('that xcache is not active')
    else:
        print('no xcache defined for the client site.')

    print('---------------------------')
