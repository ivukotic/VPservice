#!/bin/sh

shopt -s checkwinsize

export CERTPATH=/etc/grid-certs

voms-proxy-init -valid 96:0 -key $CERTPATH/userkey.pem -cert $CERTPATH/usercert.pem --voms=atlas
chmod 0400 /tmp/x509up_u0

echo "Enable shell completion on the rucio commands"
eval "$(register-python-argcomplete rucio)"
eval "$(register-python-argcomplete rucio-admin)"

python3 clean_vp_direct.py