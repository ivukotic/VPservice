from rucio.client import Client
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan

c = Client(rucio_host="https://rucio-lb-int.cern.ch")
es = Elasticsearch(["atlas-kibana.mwt2.org:9200"], http_auth=("traces_reader", "gyhujiko"), timeout=60)

start = 1556668800
print("start:", start)

my_query = {
    "_source": ["time_start", "site", "event", "scope", "filename"],
    "query": {
        "bool": {
            "must": [
                {"range": {"time_start": {"gte": start}}},
                {"exists": {"field": "filename"}},
                {"wildcard": {"site": "*MWT2*"}},
                {"term": {"event": "get_sm_a"}}
            ]
        }
    }
}

scroll = scan(client=es, index="traces", query=my_query)
count = 0
for res in scroll:
    count = count + 1
    r = res["_source"]
#     print(count, r)
    scope = r["scope"]
    filen = r["filename"]
    try:
        gj = c.list_parent_dids(scope, filen)
        ds = gj.next()
        if ds["type"] != "DATASET":
            continue
        dss = ds['scope']
        dsn = ds['name']
        # print(count, dss, dsn)
        r = c.list_dataset_replicas_vp(dss, dsn)
        for i1 in r:
            if i1['vp']:
                print(count, dss, dsn, i1)
    except Exception as identifier:
        pass


# for i in range(100):
#     r = c.list_dataset_replicas_vp("test", "name_" + str(i))
#     for j in r:
#         print(i, j)
