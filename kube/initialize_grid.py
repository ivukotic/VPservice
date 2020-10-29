import requests
import json

testing = True

if testing:
    sitename = 'http://localhost:80'
else:
    sitename = 'http://vpservice.cern.ch'

print('connecting to:', sitename)

with open('grid.json') as json_file:
    grid = json.load(json_file)
    print(grid)
    print(' --- cleaning up old grid info --- ')
    uri = sitename + '/grid/'
    r = requests.delete(uri)
    if r.status_code != 200:
        print(r.status_code)
    print(r.text)

    print(' --- setting sites --- ')
    for cloud in grid:
        print(cloud)
        for site in grid[cloud]:
            site_name, site_cores = site
            print(cloud, site_name, site_cores)
            uri = sitename + '/site/' + cloud + '/' + \
                site_name + '/' + str(site_cores)
            r = requests.put(uri)
            if r.status_code != 200:
                print(r.status_code)
            print(r.text)

    print(r.text)
