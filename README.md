# VPservice
Virtual Placement Service

Grid is described in file ```grid.json```. 
This is loaded by filler. Filler makes sure there are more than LWM and less than HWM unassigned VPs in Redis.

## TO DO

* Grid config should be changed so it loads grid data from Redis. Redis grid data can be updated through rest api. After creating every batch of unassigned VPs filler checks if grid description changed (checks only grid description version) and if it did recalculates things.
* An endpoint to delete all grid info.
* publish mkdoc
* calculate server a file will be on
* getter for path to a file
* test latency, capacity
* does it need reconnection after scaleing?
* figure out backup and export of data (BGSAVE is blocked.)
