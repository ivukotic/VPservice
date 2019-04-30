# Virtual Placement service

* Source [GitHub](https://github.com/ivukotic/vpservice)
* Docker image [DockerHub](https://cloud.docker.com/repository/docker/ivukotic/vpservice)
* [Documentation](https://ivukotic.github.io/VPservice/)
* [Presentation](https://docs.google.com/presentation/d/145aZDrp_rG5lZxyju1Diqidde4XGYNCUIU8VpKdo0OQ/edit?usp=sharing)

By default service is accessible only from inside CERN at: http://vpservice.cern.ch

## REST API

All requests are of type GET.

* /healthz - k8s liveness probe. It should always return "OK".
* /test - tests redis backend. Should always return "TEST_OK". 
* /grid - returns current core counts for all grid, clouds, and sites. NOT IMPLEMENTED
* /site/`cloud`/`site`/`cores` - sets or updates number of CPUs cores available for Virtual Placement. 
* /grid/`cores` - sets or updates total number of cores available on the grid.
* /ds/`n`/`ds_name` - if dataset was already preplaced it returns ordered list of sites. If not preplaced returns ordered list of up to `n` sites. Dataset that should not be in the system returns: _other_.
* /ds/reassign/`ds_name` - to be used only for datasets that need new Virtual Placement (eg. it was assigned to _other_).
