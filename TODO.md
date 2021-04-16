BUGs:

TODO:

* create HELM chart
    * add cleaner
    * add Prometheus monitoring to Redis, app itself

* test recalculateCluster
* make cluster take into account space at different servers when calculating ranges.
* split away routes in different files
* check how to get letsencript

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

* does it need reconnection after scaling?
* storing timestamped geo version history

* prefix these keys with meta. :
"${cloud}:${site}" contain site core number

* pre-check parameters in /site/:cloud/:sitename/:cores

* add alarm and alert on VPservice status.

* add really simple web endpoint