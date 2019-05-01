# VPservice
Virtual Placement Service

Grid is described in file ```grid.json```. 
This is loaded by filler. 
Filler makes sure there are more than LWM and less than HWM unassigned VPs in Redis.

## TO DO

* publish mkdoc
* calculate server a file will be on
* getter for path to a file
* test latency, capacity
* does it need reconnection after scaleing?
* where is backup stored?