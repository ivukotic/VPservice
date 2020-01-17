# Virtual Placement service

* Source [GitHub](https://github.com/ivukotic/vpservice)
* Docker image [DockerHub](https://cloud.docker.com/repository/docker/ivukotic/vpservice)
* [Documentation](https://ivukotic.github.io/VPservice/)
* [Presentation](https://docs.google.com/presentation/d/145aZDrp_rG5lZxyju1Diqidde4XGYNCUIU8VpKdo0OQ/edit?usp=sharing)

By default service is accessible only from inside CERN at: http://vpservice.cern.ch

## REST API

### service utils
* GET /healthz - k8s liveness probe. It should always return "OK".
* GET /test - tests redis backend. Should always return "TEST_OK". 

* DELETE /grid - cleans up all of the grid information from the db.
* DELETE /all_data - deletes all of the db.
* DELETE /site/`site` - deletes a site from configuration and removes 
* DELETE /ds/`ds_name` - deletes vp given to a dataset from the database.

* PUT /site/`cloud`/`site`/`cores` - sets or updates number of CPUs cores available for Virtual Placement. 
* PUT /site/disable/`site` - disables site
* PUT /site/enable/`site` - enables site

* GET /grid - returns current core counts for all grid, clouds, and sites.
* GET /site/`cloud`/`site` - returns number of cores at site
* GET /site/disabled - returns a list of disabled sites

### Dataset operations
* GET /ds/`n`/`ds_name` - if dataset was already preplaced it returns ordered list of sites. If not preplaced returns ordered list of up to `n` sites. Dataset that should not be in the system returns: _other_.

* /ds/reassign/`ds_name` - to be used only for datasets that need new Virtual Placement (eg. it was assigned to _other_).
