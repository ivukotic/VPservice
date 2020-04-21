#!/bin/sh

shopt -s checkwinsize

# export X509_USER_PROXY=/tmp/x509up_u0
export CERTPATH=/etc/grid-certs

voms-proxy-init -valid 96:0 -key $CERTPATH/userkey.pem -cert $CERTPATH/usercert.pem --voms=atlas

if [ ! -f /opt/rucio/etc/rucio.cfg ]; then
    echo "File rucio.cfg not found. It will generate one."
    mkdir -p /opt/rucio/etc/
    j2 /rucio.cfg.j2 > /opt/rucio/etc/rucio.cfg
fi

echo "Enable shell completion on the rucio commands"
eval "$(register-python-argcomplete rucio)"
eval "$(register-python-argcomplete rucio-admin)"

python clean_vp_rdb.py