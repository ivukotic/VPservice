# VPservice
Virtual Placement Service

Grid is described in file ```grid.json```. 
This is uploaded to the server using ```initialize_grid.py```. 
Filler makes sure there are more than LWM and less than HWM unassigned VPs in Redis.

## TO DO

* when a new site comes online, it can take a long time to get a sufficient number of datasets assigned to it. Proper fix is to have reassignement of unassigned DSs.
* reassignement 
  * freeing a DS once a cache dissapears
  * assignement of unassigned - should happen only when grid changes. 
* calculate server a file will be on
* getter for path to a file
* test latency, capacity
* does it need reconnection after scaling?
* where is backup stored?