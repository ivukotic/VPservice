Check VP replicas accessibility

* done at lxplus
* first exec into redis constainer at k8s cluster at CERN. 
    * copy dump.rdb to user home directory.
    * dump all the Redis keys and values to the file by running dumpKeys.sh
    * scp them to lxplus
* setup rucio using rucio.sh
* run python fix_unaccessible_vps.py
