# VPservice
Virtual Placement Service

Grid is described in file ```grid.json```. 
This is uploaded to the server using ```initialize_grid.py```. 
Filler makes sure there are more than LWM and less than HWM unassigned VPs in Redis.

## TO DO

* calculate server a file will be on
* getter for path to a file
* test latency, capacity
* does it need reconnection after scaling?
* where is backup stored?