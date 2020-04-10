# VPservice
## Virtual Placement Service

Grid is described in file ```grid.json```. 
This is uploaded to the server using ```initialize_grid.py```. 
Each change in grid (adding/updating a site, deleting site) causes update in the grid version. Updated grid will take effect after unassigned VPs are used up (by default 300 VPs).
A site can be disabled and enabled. This does not change VPs but only removes disabled sites from response.
A site can be deleted in which case all it's assignements get reasigned to "other".
Filler makes sure there are more than LWM and less than HWM unassigned VPs in Redis. Unassigned VPs are there just to make it faster to deliver VPs. 

![VPservice schema](VP_service_schema.png)

### CleanUp
    With time a lot of datasets that don't exist anymore get accumulated in REDIS. This procedure removes them. These are steps: 
    * get a shell in redis-master pod
    * copy paste commands from shell script *CleanUp/dumpKeys.sh*
    * scp produced keys.txt and values.txt files back to lxplus
    * on lxplus setup rucio, get grid proxy
    * place the downloaded files into CleanUp directory
    * execute: python clean_vp.py


### Tools 
    This directory contains several node.js scripts tools. *Some coding needed.*
    * fix.js - can go through all the keys and change them. 
    * dumpToES.js - dumps all of the current virtual placements to an index in ES.

## TO DO

* when there is a change in a site config (increase or decrease of share) one must rebalance part of datasets.
    Will be done on demand (so one can change multiple sites and then call rebalancing).
    
    VARIANT ONE
    * keep track of how many ds are VPed to each site (as any choice)
    * if this percentage is off by more than 5% from desired calculate how many should be reassigned. Have a parallel process do that.
    
    VARIANT TWO
    * get all DSes. 
    * do full recalculation in memory
    * do all the corrections in one go

* calculate server a file will be on
* getter for path to a file
* does it need reconnection after scaling?
* where is backup stored?
* add persistent storage
* storing timestamped geo version history
* report all requests and responses to ElasticSearch
* report all the other rest requests to ES.