* check how to get letsencript
* find what is bigger than m2.large
* add APIkey support

* Add Postman docs for all the REST endpoints.

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
* storing timestamped geo version history

* disabling site does not check that site is there at the first place. if site not there should return code 500.

* prefix these keys with meta. :
sites are in a redis set "sites"
keys "${cloud}:${site}" contain site core number
key 'grid_description_version'

* change flip_pause with pause and unpause.
* pre-check parameters in /site/:cloud/:sitename/:cores

* fillers doesn't really need more than one instance?

* get an endpoint for rucio to get xcache prefix for a given site and file

* add alarm and alert on VPservice status.

* add really simple web endpoint
* create HELM chart
* add cleaner