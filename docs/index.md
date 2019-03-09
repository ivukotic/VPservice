# Virtual Placement service

* Source [GitHub](https://github.com/ivukotic/vpservice).
* Docker image [DockerHub] (https://hub.docker.com/r/ivukotic/vpservice/).
* [documentation](http://ivukotic.io/vpservice/).
* [Presentation](google doc...)

## REST API

* /test - should always return "TEST_OK"
* /ds/`n`/`ds_name` - if dataset was already preplaced it returns ordered list of sites. If not preplaced returns ordered list of up to `n` sites. Dataset that should not be in the sistem returns: _other_.
* /site/`cloud`/`site`/`cores` - sets or updates number of CPUs cores available for Virtual Placement. 
* /site/`site` - returns probability that a dataset will have `site` to be the first choice to place the data at.
* /grid/`cores` - sets or updates total number of cores available on the grid.
