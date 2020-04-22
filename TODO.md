* Add Postman docs for all the REST endpoints.
* move confing keys or prefix them
* Redis has no persistent volume attached and backups configured.
* make cleanup container running directly against redis

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