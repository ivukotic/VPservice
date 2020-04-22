#!/bin/sh

shopt -s checkwinsize

# export X509_USER_PROXY=/tmp/x509up_u0
export CERTPATH=/etc/grid-certs

voms-proxy-init -valid 96:0 -key $CERTPATH/userkey.pem -cert $CERTPATH/usercert.pem --voms=atlas

echo "Enable shell completion on the rucio commands"
eval "$(register-python-argcomplete rucio)"
eval "$(register-python-argcomplete rucio-admin)"

python clean_vp_rdb.py