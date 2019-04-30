import requests
import json

sitename = 'http://vpservice.cern.ch'
with open('grid.json') as json_file:
    grid = json.load(json_file)
    print(grid)
    for cloud in grid['cores']:
        print(cloud)
        for site in grid['cores'][cloud]:
            site_name, site_cores = site
            print(cloud, site_name, site_cores)
            uri = sitename + '/site/' + cloud + '/' + site_name + '/' + str(site_cores)
            r = requests.put(uri)
            if r.status_code != 200:
                print(r.status_code)
            print(r.text)
